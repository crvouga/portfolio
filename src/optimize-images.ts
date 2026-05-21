/**
 * Resize every non-optimized image under ./public into a 600px-wide WebP next
 * to the source. Replaces the previous `npx sharp-cli` per-file approach —
 * each `npx` invocation cost ~1–3s of process startup; doing this in-process
 * with `sharp` is ~50–100x faster.
 *
 * Concurrency: capped at cores/2 by default. libvips (sharp's backend) is
 * already multi-threaded internally, so saturating with one sharp pipeline
 * per core thrashes; cores/2 keeps all cores busy without contention.
 */
import os from "node:os";
import path from "node:path";
import { stat } from "node:fs/promises";
import sharp from "sharp";
import pLimit from "p-limit";
import { getAllFiles } from "./library/file-system";

export const PUBLIC_DIR = "./public";
export const OPTIMIZED_WIDTH = 600;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export type OptimizeJob = {
  /** Absolute or repo-relative path to the source image. */
  readonly inputPath: string;
  /** Sibling `.optimized.webp` path. */
  readonly outputPath: string;
  /** Short label for UI ("subdir/foo.png"). */
  readonly name: string;
};

export type OptimizeResult = {
  readonly job: OptimizeJob;
  /** Source bytes. */
  readonly inputBytes: number;
  /** Output bytes (0 if skipped). */
  readonly outputBytes: number;
  /** True if we used the cached output (output mtime ≥ input mtime). */
  readonly skipped: boolean;
  readonly elapsedMs: number;
};

export type OptimizeError = {
  readonly job: OptimizeJob;
  readonly error: string;
};

/** True when output exists and is at least as new as the input. */
async function isCached(inputPath: string, outputPath: string): Promise<boolean> {
  try {
    const [inStat, outStat] = await Promise.all([stat(inputPath), stat(outputPath)]);
    return outStat.mtimeMs >= inStat.mtimeMs && outStat.size > 0;
  } catch {
    return false; // output missing or unreadable — needs (re)build
  }
}

const isOptimizedFilename = (file: string): boolean => file.includes(".optimized");

/** Walk ./public and return one OptimizeJob per source image. */
export function buildOptimizeJobs(rootDir: string = PUBLIC_DIR): OptimizeJob[] {
  const all = getAllFiles(rootDir);
  const jobs: OptimizeJob[] = [];
  for (const file of all) {
    const ext = path.extname(file).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue;
    if (isOptimizedFilename(file)) continue;
    const baseName = path.basename(file, ext);
    const outputPath = path.join(path.dirname(file), `${baseName}.optimized.webp`);
    jobs.push({
      inputPath: file,
      outputPath,
      name: path.relative(rootDir, file) || file,
    });
  }
  return jobs;
}

/** Default optimize concurrency: cores/2, capped at [2, 8]. */
export function defaultOptimizeConcurrency(): number {
  const fromEnv = Number(process.env["OPTIMIZE_CONCURRENCY"]);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2)));
}

/** Optimize a single image. Throws on failure. */
export async function optimizeOne(job: OptimizeJob): Promise<OptimizeResult> {
  const t0 = performance.now();
  const cached = await isCached(job.inputPath, job.outputPath);
  if (cached) {
    const inStat = await stat(job.inputPath);
    return {
      job,
      inputBytes: inStat.size,
      outputBytes: 0,
      skipped: true,
      elapsedMs: performance.now() - t0,
    };
  }

  await sharp(job.inputPath)
    .resize({ width: OPTIMIZED_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(job.outputPath);

  const [inStat, outStat] = await Promise.all([stat(job.inputPath), stat(job.outputPath)]);
  return {
    job,
    inputBytes: inStat.size,
    outputBytes: outStat.size,
    skipped: false,
    elapsedMs: performance.now() - t0,
  };
}

export type OptimizeBatchResult = {
  readonly ok: readonly OptimizeResult[];
  readonly failed: readonly OptimizeError[];
  readonly elapsedMs: number;
};

/**
 * Optimize a list of jobs in parallel. Failure-isolated: bad images get
 * pushed to `failed[]` and the rest of the batch proceeds.
 */
export async function optimizeImages(
  jobs: readonly OptimizeJob[] = buildOptimizeJobs(),
  concurrency: number = defaultOptimizeConcurrency(),
): Promise<OptimizeBatchResult> {
  const t0 = performance.now();
  const ok: OptimizeResult[] = [];
  const failed: OptimizeError[] = [];
  const limit = pLimit(concurrency);

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        try {
          ok.push(await optimizeOne(job));
        } catch (err) {
          failed.push({ job, error: err instanceof Error ? err.message : String(err) });
        }
      }),
    ),
  );

  return { ok, failed, elapsedMs: performance.now() - t0 };
}

// Standalone entrypoint: run when invoked via `bun run optimize-images`.
if (import.meta.main) {
  (async () => {
    const jobs = buildOptimizeJobs();
    if (jobs.length === 0) {
      console.log("No source images found.");
      return;
    }
    const concurrency = defaultOptimizeConcurrency();
    console.log(
      `Optimizing ${jobs.length} image(s) with concurrency=${concurrency}…`,
    );
    const result = await optimizeImages(jobs, concurrency);
    const reused = result.ok.filter((r) => r.skipped).length;
    const built = result.ok.length - reused;
    console.log(
      `Done in ${(result.elapsedMs / 1000).toFixed(1)}s. ` +
        `built=${built}, cached=${reused}, failed=${result.failed.length}.`,
    );
    if (result.failed.length > 0) {
      for (const f of result.failed) console.error(`  ✗ ${f.job.name} — ${f.error}`);
      process.exit(1);
    }
  })().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
