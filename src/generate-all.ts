/**
 * Orchestrate the full content-generation pipeline as fast as possible.
 *
 * Stage 1 (parallel):
 *   - All screenshots (work + projects + main) — one shared Chromium, bounded
 *     concurrency. Live per-job spinner via listr2.
 *   - Resume PDF — runs concurrently in its own process slot.
 *
 * Stage 2 (parallel):
 *   - Image optimization with `sharp` in-process; concurrency = cores/2 by
 *     default. Incremental: skips files where the .optimized.webp is newer
 *     than the source.
 *
 * Each parallel job is rendered as its own listr2 task so the user sees the
 * live state of everything at once.
 */
import { mkdir } from "node:fs/promises";
import { Listr } from "listr2";
import pretty from "pretty-ms";
import prettyBytes from "pretty-bytes";
import pc from "picocolors";

import {
  PUBLIC_DIR as SCREENSHOT_PUBLIC_DIR,
  captureScreenshot,
  closeSharedBrowser,
  defaultScreenshotConcurrency,
  launchSharedBrowser,
  warmupScreenshotJobs,
  type ScreenshotJob,
} from "./screenshot-helpers";
import { buildAllScreenshotJobs } from "./screenshot-jobs";
import {
  buildOptimizeJobs,
  defaultOptimizeConcurrency,
  optimizeOne,
  type OptimizeJob,
} from "./optimize-images";
import { generateResume } from "./generate-resume";
import type { Browser } from "playwright";

type Ctx = {
  browser?: Browser;
  screenshotConcurrency: number;
  optimizeConcurrency: number;
  failures: { stage: string; name: string; error: string }[];
  totals: {
    screenshots: { ok: number; failed: number };
    images: { built: number; cached: number; failed: number; bytesBefore: number; bytesAfter: number };
    resume: "ok" | "failed" | "skipped";
  };
};

function fmtElapsed(ms: number): string {
  return pc.dim(pretty(ms, { compact: false, secondsDecimalDigits: 1 }));
}

const screenshotJobs = buildAllScreenshotJobs();

const ctx: Ctx = {
  screenshotConcurrency: defaultScreenshotConcurrency(),
  optimizeConcurrency: defaultOptimizeConcurrency(),
  failures: [],
  totals: {
    screenshots: { ok: 0, failed: 0 },
    images: { built: 0, cached: 0, failed: 0, bytesBefore: 0, bytesAfter: 0 },
    resume: "skipped",
  },
};

const tasks = new Listr<Ctx>(
  [
    {
      title: pc.dim("Boot Chromium"),
      task: async (ctx, t) => {
        await mkdir(SCREENSHOT_PUBLIC_DIR, { recursive: true });
        const t0 = performance.now();
        ctx.browser = await launchSharedBrowser();
        t.title = `${pc.dim("Boot Chromium")}  ${fmtElapsed(performance.now() - t0)}`;
      },
    },
    {
      title: pc.dim("Warm up hosted apps"),
      task: async (_, t) => {
        const t0 = performance.now();
        await warmupScreenshotJobs(screenshotJobs);
        t.title = `${pc.dim("Warm up hosted apps")}  ${fmtElapsed(performance.now() - t0)}`;
      },
    },
    {
      title: pc.bold(
        `Stage 1 — screenshots (${screenshotJobs.length}) + resume ${pc.dim(
          `[parallel: cs=${ctx.screenshotConcurrency}]`,
        )}`,
      ),
      task: (_, parent) =>
        parent.newListr(
          [
            {
              title: `Screenshots ${pc.dim(`(${screenshotJobs.length} sites)`)}`,
              task: (_, t) =>
                t.newListr(
                  screenshotJobs.map((job: ScreenshotJob) => ({
                    title: job.name,
                    task: async (ctx, sub) => {
                      if (!ctx.browser) throw new Error("Chromium not booted yet");
                      try {
                        const r = await captureScreenshot(ctx.browser, job);
                        ctx.totals.screenshots.ok += 1;
                        sub.title = `${job.name}  ${fmtElapsed(r.elapsedMs)}`;
                      } catch (err) {
                        ctx.totals.screenshots.failed += 1;
                        const msg = err instanceof Error ? err.message : String(err);
                        ctx.failures.push({ stage: "screenshot", name: job.name, error: msg });
                        throw new Error(msg);
                      }
                    },
                  })),
                  {
                    concurrent: ctx.screenshotConcurrency,
                    exitOnError: false,
                    rendererOptions: { collapseSubtasks: false },
                  },
                ),
            },
            {
              title: "Resume PDF",
              task: async (ctx, t) => {
                const t0 = performance.now();
                try {
                  const path = await generateResume();
                  ctx.totals.resume = "ok";
                  t.title = `Resume PDF ${pc.dim(path)} ${fmtElapsed(performance.now() - t0)}`;
                } catch (err) {
                  ctx.totals.resume = "failed";
                  const msg = err instanceof Error ? err.message : String(err);
                  ctx.failures.push({ stage: "resume", name: "Resume PDF", error: msg });
                  throw new Error(msg);
                }
              },
            },
          ],
          { concurrent: true, exitOnError: false, rendererOptions: { collapseSubtasks: false } },
        ),
    },
    {
      title: pc.dim("Tear down Chromium"),
      task: async (ctx, t) => {
        await closeSharedBrowser(ctx.browser);
        delete ctx.browser;
        t.title = pc.dim("Tear down Chromium (closed)");
      },
    },
    {
      // Image jobs are computed lazily because Stage 1 may have written new
      // PNGs that this stage needs to discover.
      title: pc.bold(`Stage 2 — optimize images ${pc.dim(`[parallel: opt=${ctx.optimizeConcurrency}]`)}`),
      task: async (ctx, parent) => {
        const jobs = buildOptimizeJobs();
        if (jobs.length === 0) {
          parent.title = `${pc.bold("Stage 2 — optimize images")} ${pc.dim("(no images found)")}`;
          return;
        }
        return parent.newListr(
          jobs.map((job: OptimizeJob) => ({
            title: job.name,
            task: async (ctx, sub) => {
              try {
                const r = await optimizeOne(job);
                if (r.skipped) {
                  ctx.totals.images.cached += 1;
                  sub.title = `${job.name}  ${pc.dim("(cached)")}`;
                } else {
                  ctx.totals.images.built += 1;
                  ctx.totals.images.bytesBefore += r.inputBytes;
                  ctx.totals.images.bytesAfter += r.outputBytes;
                  sub.title = `${job.name}  ${pc.dim(
                    `${prettyBytes(r.inputBytes)} → ${prettyBytes(r.outputBytes)}`,
                  )} ${fmtElapsed(r.elapsedMs)}`;
                }
              } catch (err) {
                ctx.totals.images.failed += 1;
                const msg = err instanceof Error ? err.message : String(err);
                ctx.failures.push({ stage: "optimize", name: job.name, error: msg });
                throw new Error(msg);
              }
            },
          })),
          {
            concurrent: ctx.optimizeConcurrency,
            exitOnError: false,
            rendererOptions: { collapseSubtasks: false },
          },
        );
      },
    },
  ],
  {
    concurrent: false, // stages run sequentially; tasks within stages are concurrent
    exitOnError: false,
    rendererOptions: { collapseSubtasks: false, showSubtasks: true },
  },
);

const t0 = performance.now();
let exitCode = 0;
try {
  await tasks.run(ctx);
} catch (err) {
  exitCode = 1;
  console.error(pc.red("\nOrchestrator threw:"), err instanceof Error ? err.message : err);
} finally {
  // Defensive: never leave a Chromium hanging if stage 1 errored before the
  // explicit teardown task ran.
  await closeSharedBrowser(ctx.browser);
}

const elapsed = performance.now() - t0;
const { screenshots, images, resume } = ctx.totals;

console.log();
console.log(pc.bold("Summary"));
console.log(
  `  ${pc.cyan("Screenshots")}: ${pc.green(`${screenshots.ok} ok`)}, ${pc.red(
    `${screenshots.failed} failed`,
  )} (out of ${screenshotJobs.length})`,
);
console.log(
  `  ${pc.cyan("Resume PDF")}:  ${
    resume === "ok" ? pc.green("ok") : resume === "failed" ? pc.red("failed") : pc.dim("skipped")
  }`,
);
console.log(
  `  ${pc.cyan("Images")}:      ${pc.green(`${images.built} built`)}, ${pc.dim(
    `${images.cached} cached`,
  )}, ${pc.red(`${images.failed} failed`)}` +
    (images.bytesBefore > 0
      ? `  ${pc.dim(`(${prettyBytes(images.bytesBefore)} → ${prettyBytes(images.bytesAfter)})`)}`
      : ""),
);
console.log(`  ${pc.cyan("Total")}:       ${pretty(elapsed)}`);

if (ctx.failures.length > 0) {
  console.log();
  console.log(pc.red(pc.bold(`Failures (${ctx.failures.length}):`)));
  for (const f of ctx.failures) {
    console.log(`  ${pc.red("✗")} [${f.stage}] ${f.name} — ${f.error}`);
  }
  // Treat non-trivial failures as a non-zero exit so CI catches them.
  if (resume === "failed" || images.failed > 0) exitCode = 1;
}

process.exit(exitCode);
