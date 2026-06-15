import os from "node:os";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import pLimit from "p-limit";

export const VIEWPORT = { width: 1920, height: 1080 } as const;
export const PUBLIC_DIR = path.resolve("./public");

/** Nav timeout for external sites (env: SCREENSHOT_TIMEOUT_MS). */
const DEFAULT_NAV_TIMEOUT_MS = readPositiveEnv("SCREENSHOT_TIMEOUT_MS", 45_000);
/** Nav timeout for chrisvouga.dev-hosted URLs (env: SCREENSHOT_HOSTED_TIMEOUT_MS). */
const HOSTED_NAV_TIMEOUT_MS = readPositiveEnv("SCREENSHOT_HOSTED_TIMEOUT_MS", 45_000);
const DEFAULT_MAX_RETRIES = 1;
const HOSTED_MAX_RETRIES = 1;
const RETRY_DELAY_MS = readPositiveEnv("SCREENSHOT_RETRY_DELAY_MS", 2_000);
const WARMUP_TIMEOUT_MS = readPositiveEnv("SCREENSHOT_WARMUP_TIMEOUT_MS", 25_000);
/** Hard cap on total time per screenshot job (env: SCREENSHOT_MAX_JOB_MS). */
const MAX_JOB_MS = readPositiveEnv("SCREENSHOT_MAX_JOB_MS", 90_000);
const SETTLE_MS = 2_000;
const WARMUP_CONCURRENCY = readPositiveEnv("SCREENSHOT_WARMUP_CONCURRENCY", 8);

const CHRISVOUGA_DEV_ZONE = "chrisvouga.dev";

export type ScreenshotJob = {
  /** Human-readable identifier used in logs (e.g. project title). */
  readonly name: string;
  readonly url: string;
  /** Output filename without the `-screenshot.png` suffix. */
  readonly filename: string;
};

export type CaptureResult = {
  readonly screenshotPath: string;
  readonly elapsedMs: number;
};

function readPositiveEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when the URL is hosted on the chrisvouga.dev stack. */
export function isHostedOnChrisvougaDev(url: string): boolean {
  const host = hostnameOf(url);
  return (
    host != null &&
    (host === CHRISVOUGA_DEV_ZONE || host.endsWith(`.${CHRISVOUGA_DEV_ZONE}`))
  );
}

function navTimeoutForUrl(url: string): number {
  return isHostedOnChrisvougaDev(url) ? HOSTED_NAV_TIMEOUT_MS : DEFAULT_NAV_TIMEOUT_MS;
}

function maxRetriesForUrl(url: string): number {
  return isHostedOnChrisvougaDev(url) ? HOSTED_MAX_RETRIES : DEFAULT_MAX_RETRIES;
}

function isRetriableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function isRetriableError(message: string): boolean {
  return (
    /timeout/i.test(message) ||
    /no response/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /net::ERR_/i.test(message)
  );
}

async function navigateAndSettle(page: Page, url: string, timeoutMs: number) {
  const response = await page.goto(url, {
    waitUntil: "load",
    timeout: timeoutMs,
  });
  if (!response) throw new Error("No response received from server");
  const status = response.status();
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status}: server returned non-success status code`);
  }
  await page.waitForTimeout(SETTLE_MS);
  return response;
}

/**
 * Sequential GETs to warm chrisvouga.dev-hosted URLs before Playwright runs.
 * Skipped when SCREENSHOT_SKIP_WARMUP=1.
 */
export async function warmupScreenshotJobs(jobs: readonly ScreenshotJob[]): Promise<void> {
  if (process.env["SCREENSHOT_SKIP_WARMUP"] === "1") return;

  const urls = [...new Set(jobs.filter((j) => isHostedOnChrisvougaDev(j.url)).map((j) => j.url))];
  if (urls.length === 0) return;

  console.log(
    `\nWarmup: pre-fetching ${urls.length} chrisvouga.dev site(s) ` +
      `(timeout=${WARMUP_TIMEOUT_MS}ms, concurrency=${WARMUP_CONCURRENCY})…`,
  );
  const limit = pLimit(WARMUP_CONCURRENCY);
  await Promise.all(
    urls.map((url) =>
      limit(async () => {
        const host = hostnameOf(url) ?? url;
        const start = Date.now();
        try {
          const res = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
          });
          console.log(`  warmup ${host} ${res.status} in ${Date.now() - start}ms`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`  warmup ${host} still waking (${msg}) in ${Date.now() - start}ms`);
        }
      }),
    ),
  );
  console.log("");
}

/** Default screenshot concurrency: capped at 12, never exceeds available cores. */
export function defaultScreenshotConcurrency(): number {
  const fromEnv = Number(process.env["SCREENSHOT_CONCURRENCY"]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return Math.max(2, Math.min(12, os.cpus().length));
}

/** Launch a fresh Chromium. Caller MUST close it (use try/finally). */
export async function launchSharedBrowser(): Promise<Browser> {
  return chromium.launch();
}

/** Close a Browser without throwing — logs cleanup failures and moves on. */
export async function closeSharedBrowser(browser: Browser | undefined): Promise<void> {
  if (!browser) return;
  try {
    await browser.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`(cleanup) browser.close() failed: ${msg}`);
  }
}

/**
 * Capture a single screenshot using a shared {@link Browser}. Each job runs in
 * its own ephemeral {@link BrowserContext} (incognito-like) so cookies /
 * storage are isolated from other jobs running in parallel.
 *
 * Uses `load` (not `networkidle`) and longer timeouts for chrisvouga.dev URLs.
 * Retries transient failures with backoff.
 */
export async function captureScreenshot(
  browser: Browser,
  job: { url: string; filename: string },
): Promise<CaptureResult> {
  const t0 = performance.now();
  const timeoutMs = navTimeoutForUrl(job.url);
  const maxAttempts = maxRetriesForUrl(job.url) + 1;
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const elapsed = performance.now() - t0;
    if (elapsed >= MAX_JOB_MS) {
      throw new Error(`Job timed out after ${Math.round(elapsed)}ms (cap=${MAX_JOB_MS}ms)`);
    }

    const context = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: "dark",
    });
    try {
      const page = await context.newPage();
      await page.emulateMedia({ colorScheme: "dark" });

      const remainingMs = Math.max(5_000, MAX_JOB_MS - (performance.now() - t0));
      await navigateAndSettle(page, job.url, Math.min(timeoutMs, remainingMs));

      const screenshotPath = path.join(PUBLIC_DIR, `${job.filename}-screenshot.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      return { screenshotPath, elapsedMs: performance.now() - t0 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      const statusMatch = message.match(/HTTP (\d+)/);
      const status = statusMatch ? Number(statusMatch[1]) : 0;
      const retriable = isRetriableError(message) || isRetriableStatus(status);

      if (attempt < maxAttempts && retriable) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      throw new Error(
        maxAttempts > 1 ? `${message} (after ${attempt} attempt(s))` : message,
      );
    } finally {
      try {
        await context.close();
      } catch (closeErr) {
        const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
        console.warn(`  (cleanup) context.close() failed: ${msg}`);
      }
    }
  }

  throw new Error(lastError);
}

export type RunResult = {
  readonly ok: number;
  readonly failed: readonly { readonly name: string; readonly url: string; readonly error: string }[];
  readonly elapsedMs: number;
};

export type RunOptions = {
  readonly concurrency?: number;
  /** If you already have a Browser, reuse it instead of launching/tearing down. */
  readonly browser?: Browser;
  /** Warm chrisvouga.dev URLs before capturing (default true). */
  readonly warmup?: boolean;
};

/**
 * Standalone screenshot runner used by the per-collection scripts
 * (`screenshot-work`, `screenshot-projects`, `screenshot-main`).
 */
export async function runScreenshotJobs(
  label: string,
  jobs: readonly ScreenshotJob[],
  options: RunOptions = {},
): Promise<RunResult> {
  if (jobs.length === 0) return { ok: 0, failed: [], elapsedMs: 0 };

  const warmup = options.warmup ?? true;
  if (warmup) await warmupScreenshotJobs(jobs);

  const concurrency = options.concurrency ?? defaultScreenshotConcurrency();
  const ownsBrowser = !options.browser;
  let browser = options.browser;

  const t0 = performance.now();
  if (!browser) {
    try {
      browser = await launchSharedBrowser();
    } catch (launchErr) {
      const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
      console.error(`✗ Failed to launch Chromium: ${msg}`);
      console.error("  Hint: try `bunx playwright install chromium`");
      return {
        ok: 0,
        failed: jobs.map((j) => ({ name: j.name, url: j.url, error: `chromium launch failed: ${msg}` })),
        elapsedMs: performance.now() - t0,
      };
    }
  }

  const failed: { name: string; url: string; error: string }[] = [];
  let ok = 0;

  console.log(`[${label}] running ${jobs.length} job(s) with concurrency=${concurrency}…`);

  const limit = pLimit(concurrency);
  try {
    await Promise.all(
      jobs.map((job) =>
        limit(async () => {
          try {
            const r = await captureScreenshot(browser!, job);
            ok += 1;
            console.log(`  ✓ ${job.name}  (${(r.elapsedMs / 1000).toFixed(1)}s)`);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failed.push({ name: job.name, url: job.url, error: message });
            console.error(`  ✗ ${job.name}: ${message}`);
          }
        }),
      ),
    );
  } finally {
    if (ownsBrowser) await closeSharedBrowser(browser);
  }

  const elapsedMs = performance.now() - t0;
  console.log(`[${label}] done. ok=${ok}, failed=${failed.length}, elapsed=${(elapsedMs / 1000).toFixed(1)}s`);
  if (failed.length > 0) {
    console.log("Failed jobs:");
    for (const f of failed) console.log(`  • ${f.name} (${f.url}) — ${f.error}`);
  }
  return { ok, failed, elapsedMs };
}
