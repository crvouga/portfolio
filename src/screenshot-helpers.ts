import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import pLimit from "p-limit";

export const VIEWPORT = { width: 1920, height: 1080 } as const;
export const PUBLIC_DIR = path.resolve("./public");

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
 * Throws on failure (so the caller — typically a listr2 task — can catch and
 * mark the task red). Always closes the per-job context.
 */
export async function captureScreenshot(
  browser: Browser,
  job: { url: string; filename: string },
): Promise<CaptureResult> {
  const t0 = performance.now();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
  });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: "dark" });

    const response = await page.goto(job.url, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    if (!response) throw new Error("No response received from server");
    const status = response.status();
    if (status < 200 || status >= 300) {
      throw new Error(`HTTP ${status}: server returned non-success status code`);
    }

    await page.waitForTimeout(2_000);
    const screenshotPath = path.join(PUBLIC_DIR, `${job.filename}-screenshot.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return { screenshotPath, elapsedMs: performance.now() - t0 };
  } finally {
    try {
      await context.close();
    } catch (closeErr) {
      const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
      console.warn(`  (cleanup) context.close() failed: ${msg}`);
    }
  }
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
};

/**
 * Standalone screenshot runner used by the per-collection scripts
 * (`screenshot-work`, `screenshot-projects`, `screenshot-main`).
 *
 * Runs every job in parallel with bounded concurrency and a single shared
 * Chromium. Failure-isolated: returns a list of failed jobs instead of
 * throwing. Logs a compact one-line-per-job summary so it stays usable
 * outside listr2.
 */
export async function runScreenshotJobs(
  label: string,
  jobs: readonly ScreenshotJob[],
  options: RunOptions = {},
): Promise<RunResult> {
  if (jobs.length === 0) return { ok: 0, failed: [], elapsedMs: 0 };

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
