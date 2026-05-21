#!/usr/bin/env bun
/**
 * HTTP health-check every public URL referenced by the portfolio.
 *
 * Fly.io apps scale to zero (suspend). A single 10s fetch after a 30s sleep
 * is not enough — cold starts routinely take 15–60s. This script:
 *
 *   1. Optionally warms every deploy target from `projects.ts` (sequential
 *      GETs with a long timeout so machines wake before the real check).
 *   2. Checks all URLs with per-host timeouts and retries + backoff.
 *
 * Usage:
 *   bun run scripts/health-check-urls.ts
 *   bun run scripts/health-check-urls.ts --no-warmup
 *   bun run scripts/health-check-urls.ts --fly-timeout-ms 120000 --retries 8
 */
import { CONTENT } from "../src/content/content";
import { PROJECTS } from "../src/content/project";
import { WORK } from "../src/content/work";
import {
  deployHealthCheck,
  deployScaleToZero,
  getInfraTargets,
  getScaleToZeroHostnames,
} from "../projects.js";

type UrlCheckResult = {
  url: string;
  status: number;
  ok: boolean;
  error?: string;
  duration: number;
  attempts: number;
};

type CheckOptions = {
  readonly timeoutMs: number;
  readonly retries: number;
  readonly retryDelayMs: number;
  readonly flyHosted: boolean;
};

type Args = {
  readonly warmup: boolean;
  readonly flyTimeoutMs: number;
  readonly defaultTimeoutMs: number;
  readonly retries: number;
  readonly flyRetries: number;
  readonly retryDelayMs: number;
  readonly warmupTimeoutMs: number;
};

const SCALE_TO_ZERO_HOSTNAMES = getScaleToZeroHostnames();

function parseArgs(argv: readonly string[]): Args {
  let warmup = true;
  let flyTimeoutMs = 90_000;
  let defaultTimeoutMs = 20_000;
  let retries = 2;
  let flyRetries = 6;
  let retryDelayMs = 5_000;
  let warmupTimeoutMs = 120_000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-warmup") warmup = false;
    else if (arg === "--warmup") warmup = true;
    else if (arg === "--fly-timeout-ms") flyTimeoutMs = Number(argv[++i] ?? flyTimeoutMs);
    else if (arg === "--timeout-ms") defaultTimeoutMs = Number(argv[++i] ?? defaultTimeoutMs);
    else if (arg === "--retries") {
      const n = Number(argv[++i] ?? retries);
      retries = n;
      flyRetries = n;
    } else if (arg === "--fly-retries") flyRetries = Number(argv[++i] ?? flyRetries);
    else if (arg === "--retry-delay-ms") retryDelayMs = Number(argv[++i] ?? retryDelayMs);
    else if (arg === "--warmup-timeout-ms") warmupTimeoutMs = Number(argv[++i] ?? warmupTimeoutMs);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/health-check-urls.ts " +
          "[--warmup | --no-warmup] [--fly-timeout-ms <ms>] [--timeout-ms <ms>] " +
          "[--retries <n>] [--fly-retries <n>] [--retry-delay-ms <ms>] [--warmup-timeout-ms <ms>]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { warmup, flyTimeoutMs, defaultTimeoutMs, retries, flyRetries, retryDelayMs, warmupTimeoutMs };
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isScaleToZeroFlyUrl(url: string): boolean {
  const host = hostnameOf(url);
  return host != null && SCALE_TO_ZERO_HOSTNAMES.has(host);
}

function optionsForUrl(url: string, args: Args): CheckOptions {
  const flyHosted = isScaleToZeroFlyUrl(url);
  return {
    flyHosted,
    timeoutMs: flyHosted ? args.flyTimeoutMs : args.defaultTimeoutMs,
    retries: flyHosted ? args.flyRetries : args.retries,
    retryDelayMs: args.retryDelayMs,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
): Promise<{ status: number; ok: boolean }> {
  const response = await fetch(url, {
    method,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const isLinkedIn = url.includes("linkedin.com");
  const ok =
    response.ok ||
    (isLinkedIn && (response.status === 999 || response.status === 405));
  return { status: response.status, ok };
}

async function checkUrlOnce(url: string, opts: CheckOptions): Promise<UrlCheckResult> {
  const startTime = Date.now();
  const isLinkedIn = url.includes("linkedin.com");

  try {
    // HEAD is fast when supported; Fly cold starts and some stacks are slow
    // or return 405 on HEAD — fall back to GET for our hosted apps.
    let lastStatus = 0;
    let lastOk = false;
    try {
      const head = await fetchOnce(url, "HEAD", opts.timeoutMs);
      lastStatus = head.status;
      lastOk = head.ok;
      if (lastOk) {
        return {
          url,
          status: lastStatus,
          ok: true,
          duration: Date.now() - startTime,
          attempts: 1,
        };
      }
      if (!opts.flyHosted && !isLinkedIn) {
        return {
          url,
          status: lastStatus,
          ok: false,
          duration: Date.now() - startTime,
          attempts: 1,
        };
      }
    } catch {
      /* try GET below for fly-hosted / linkedin edge cases */
    }

    const get = await fetchOnce(url, "GET", opts.timeoutMs);
    lastStatus = get.status;
    lastOk = get.ok;
    return {
      url,
      status: lastStatus,
      ok: lastOk,
      duration: Date.now() - startTime,
      attempts: 1,
    };
  } catch (error) {
    return {
      url,
      status: 0,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      attempts: 1,
    };
  }
}

async function checkUrlWithRetries(url: string, args: Args): Promise<UrlCheckResult> {
  const opts = optionsForUrl(url, args);
  const maxAttempts = opts.retries + 1;
  let last: UrlCheckResult = {
    url,
    status: 0,
    ok: false,
    error: "no attempts",
    duration: 0,
    attempts: 0,
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      `Checking: ${url}...` +
        (attempt > 1 ? ` (retry ${attempt - 1}/${opts.retries})` : "") +
        (opts.flyHosted ? " [fly]" : ""),
    );
    const result = await checkUrlOnce(url, opts);
    last = { ...result, attempts: attempt };

    if (result.ok) {
      const note = opts.flyHosted && attempt > 1 ? ` after ${attempt} attempt(s)` : "";
      console.log(`  ✓ OK (${result.status})${note} - ${result.duration}ms`);
      return last;
    }

    const errMsg = result.error ?? `HTTP ${result.status}`;
    console.log(
      `  ✗ attempt ${attempt}/${maxAttempts}: ${errMsg} - ${result.duration}ms` +
        (attempt < maxAttempts ? ` — waiting ${opts.retryDelayMs}ms` : ""),
    );

    if (attempt < maxAttempts) {
      await sleep(opts.retryDelayMs);
    } else {
      last = { ...result, error: errMsg, attempts: attempt };
    }
  }

  return last;
}

/** Sequential GETs to wake suspended Fly machines before the parallel sweep. */
async function warmupFlyApps(args: Args): Promise<void> {
  const targets = getInfraTargets().filter(
    (t) => deployHealthCheck(t.deploy) && deployScaleToZero(t.deploy),
  );
  console.log(
    `\n🔥 Warmup: waking ${targets.length} scale-to-zero Fly target(s) ` +
      `(timeout=${args.warmupTimeoutMs}ms each, sequential)\n`,
  );
  for (const target of targets) {
    const url = `https://${target.deploy.hostname}/`;
    const label = `${target.id} (${target.deploy.hostname})`;
    process.stdout.write(`  warmup ${label}... `);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(args.warmupTimeoutMs),
      });
      console.log(`${res.status} in ${Date.now() - start}ms`);
    } catch (err) {
      // Warmup failure is non-fatal — the retry loop below is the gate.
      console.log(
        `still waking (${err instanceof Error ? err.message : err}) in ${Date.now() - start}ms`,
      );
    }
  }
  console.log("");
}

const extractUrls = (): string[] => {
  const urls = new Set<string>();

  if (CONTENT.SITE_URL) urls.add(CONTENT.SITE_URL);
  if (CONTENT.SITE_SOURCE_CODE_URL) urls.add(CONTENT.SITE_SOURCE_CODE_URL);
  if (CONTENT.GITHUB_URL) urls.add(CONTENT.GITHUB_URL);
  if (CONTENT.LINKEDIN_URL) urls.add(CONTENT.LINKEDIN_URL);

  for (const project of PROJECTS) {
    if (project.deployment?.t === "public" && project.deployment.url) {
      if (project.deploy != null && !deployHealthCheck(project.deploy)) {
        continue;
      }
      urls.add(project.deployment.url);
    }
    if (project.code?.t === "public" && project.code.url) {
      urls.add(project.code.url);
    }
  }

  for (const work of WORK) {
    if (work.infoUrl) {
      urls.add(work.infoUrl);
    }
  }

  return Array.from(urls).sort();
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const urls = extractUrls();
  const flyUrlCount = urls.filter(isScaleToZeroFlyUrl).length;

  console.log(
    `\n🔍 Health Check: ${urls.length} URL(s) (${flyUrlCount} scale-to-zero Fly)\n`,
  );
  console.log(
    `   Fly: timeout=${args.flyTimeoutMs}ms, retries=${args.flyRetries}, ` +
      `delay=${args.retryDelayMs}ms`,
  );
  console.log(
    `   Other: timeout=${args.defaultTimeoutMs}ms, retries=${args.retries}\n`,
  );

  if (args.warmup) {
    await warmupFlyApps(args);
  }

  console.log("=".repeat(60));

  const startTime = Date.now();
  const results = await Promise.all(urls.map((url) => checkUrlWithRetries(url, args)));
  const totalDuration = Date.now() - startTime;

  console.log("=".repeat(60));
  console.log("\n📊 Summary:\n");

  let failed = 0;
  const failedUrls: Array<{ url: string; error: string; attempts: number }> = [];

  for (const result of results) {
    if (!result.ok) {
      failed++;
      failedUrls.push({
        url: result.url,
        error: result.error || `HTTP ${result.status}`,
        attempts: result.attempts,
      });
    }
  }

  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  const maxDuration = Math.max(...results.map((r) => r.duration));
  const minDuration = Math.min(...results.map((r) => r.duration));

  console.log(`Total URLs checked: ${results.length}`);
  console.log(`Successful: ${results.length - failed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total time: ${totalDuration}ms`);
  console.log(`Average response time: ${Math.round(avgDuration)}ms`);
  console.log(`Fastest: ${minDuration}ms`);
  console.log(`Slowest: ${maxDuration}ms`);

  if (failed > 0) {
    console.log("\n❌ Failed URLs:\n");
    for (const failedUrl of failedUrls) {
      console.log(`  • ${failedUrl.url}`);
      console.log(`    Error: ${failedUrl.error} (${failedUrl.attempts} attempt(s))`);
    }
    console.error(`\n❌ Health check failed: ${failed} URL(s) are not accessible`);
    process.exit(1);
  }

  console.log("\n✅ All URLs are healthy!");
};

main().catch((error) => {
  console.error("Health check failed:", error);
  process.exit(1);
});
