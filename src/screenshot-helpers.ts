import path from "path";
import { chromium, type Browser } from "playwright";

export const VIEWPORT = { width: 1920, height: 1080 } as const;
export const PUBLIC_DIR = path.resolve("./public");

export type ScreenshotJob = {
  /** Human-readable identifier used in logs (e.g. project title). */
  readonly name: string;
  readonly url: string;
  /** Output filename without the `-screenshot.png` suffix. */
  readonly filename: string;
};

/**
 * Capture one screenshot using a shared {@link Browser}. Each job runs in its
 * own ephemeral {@link BrowserContext} (incognito-like) so cookies / storage
 * are isolated from neighbouring jobs.
 *
 * Always tears down the per-job context, even on failure. A failure inside
 * `context.close()` is logged but never re-thrown so the caller sees the
 * *original* error, not the cleanup error.
 */
async function captureWithBrowser(
  browser: Browser,
  job: { url: string; filename: string },
): Promise<string> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
  });
  try {
    const page = await context.newPage();
    await page.emulateMedia({ colorScheme: "dark" });

    console.log(`Navigating to ${job.url}...`);
    const response = await page.goto(job.url, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    if (!response) throw new Error("No response received from server");
    const status = response.status();
    if (status < 200 || status >= 300) {
      throw new Error(`HTTP ${status} error: server returned non-success status code`);
    }

    await page.waitForTimeout(2000);
    const screenshotPath = path.join(PUBLIC_DIR, `${job.filename}-screenshot.png`);
    console.log(`Taking screenshot: ${screenshotPath}`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    return screenshotPath;
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
};

/**
 * Launches a single Chromium instance and runs every job sequentially against
 * it. A failure on any job logs and the runner continues with the next job —
 * this function never throws after launch.
 */
export async function runScreenshotJobs(
  label: string,
  jobs: readonly ScreenshotJob[],
): Promise<RunResult> {
  if (jobs.length === 0) return { ok: 0, failed: [] };

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch();
  } catch (launchErr) {
    const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
    console.error(`✗ Failed to launch Chromium: ${msg}`);
    console.error("  Hint: try `bunx playwright install chromium`");
    return {
      ok: 0,
      failed: jobs.map((j) => ({ name: j.name, url: j.url, error: `chromium launch failed: ${msg}` })),
    };
  }

  const failed: { name: string; url: string; error: string }[] = [];
  let ok = 0;
  try {
    for (const job of jobs) {
      try {
        console.log(`\nProcessing: ${job.name}`);
        console.log(`URL: ${job.url}`);
        console.log(`Filename: ${job.filename}-screenshot.png`);
        const screenshotPath = await captureWithBrowser(browser, job);
        console.log(`✓ Screenshot saved: ${screenshotPath}`);
        ok += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push({ name: job.name, url: job.url, error: message });
        console.error(`✗ Failed to process ${job.name}: ${message}`);
        console.error(`  Continuing with next entry...`);
      }
    }
  } finally {
    try {
      await browser.close();
    } catch (closeErr) {
      const msg = closeErr instanceof Error ? closeErr.message : String(closeErr);
      console.warn(`(cleanup) browser.close() failed: ${msg}`);
    }
  }

  console.log(`\n[${label}] done. ok=${ok}, failed=${failed.length}`);
  if (failed.length > 0) {
    console.log("Failed jobs:");
    for (const f of failed) console.log(`  • ${f.name} (${f.url}) — ${f.error}`);
  }
  return { ok, failed };
}
