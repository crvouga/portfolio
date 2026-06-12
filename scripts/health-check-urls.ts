#!/usr/bin/env bun
/**
 * HTTP health-check every public URL referenced by portfolio content.
 *
 * Usage:
 *   bun run scripts/health-check-urls.ts
 *   bun run scripts/health-check-urls.ts --timeout-ms 30000 --retries 4
 */
import { CONTENT } from "../src/content/content";
import { PROJECTS } from "../src/content/project";
import { WORK } from "../src/content/work";

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
};

type Args = {
  readonly timeoutMs: number;
  readonly retries: number;
  readonly retryDelayMs: number;
};

function parseArgs(argv: readonly string[]): Args {
  let timeoutMs = 20_000;
  let retries = 2;
  let retryDelayMs = 5_000;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--timeout-ms") timeoutMs = Number(argv[++i] ?? timeoutMs);
    else if (arg === "--retries") retries = Number(argv[++i] ?? retries);
    else if (arg === "--retry-delay-ms") retryDelayMs = Number(argv[++i] ?? retryDelayMs);
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/health-check-urls.ts " +
          "[--timeout-ms <ms>] [--retries <n>] [--retry-delay-ms <ms>]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { timeoutMs, retries, retryDelayMs };
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
    try {
      const head = await fetchOnce(url, "HEAD", opts.timeoutMs);
      if (head.ok) {
        return {
          url,
          status: head.status,
          ok: true,
          duration: Date.now() - startTime,
          attempts: 1,
        };
      }
      if (!isLinkedIn) {
        return {
          url,
          status: head.status,
          ok: false,
          duration: Date.now() - startTime,
          attempts: 1,
        };
      }
    } catch {
      /* try GET below for linkedin edge cases */
    }

    const get = await fetchOnce(url, "GET", opts.timeoutMs);
    return {
      url,
      status: get.status,
      ok: get.ok,
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
  const opts: CheckOptions = {
    timeoutMs: args.timeoutMs,
    retries: args.retries,
    retryDelayMs: args.retryDelayMs,
  };
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
        (attempt > 1 ? ` (retry ${attempt - 1}/${opts.retries})` : ""),
    );
    const result = await checkUrlOnce(url, opts);
    last = { ...result, attempts: attempt };

    if (result.ok) {
      console.log(`  ✓ OK (${result.status}) - ${result.duration}ms`);
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

const extractUrls = (): string[] => {
  const urls = new Set<string>();

  if (CONTENT.SITE_URL) urls.add(CONTENT.SITE_URL);
  if (CONTENT.SITE_SOURCE_CODE_URL) urls.add(CONTENT.SITE_SOURCE_CODE_URL);
  if (CONTENT.GITHUB_URL) urls.add(CONTENT.GITHUB_URL);
  if (CONTENT.LINKEDIN_URL) urls.add(CONTENT.LINKEDIN_URL);

  for (const project of PROJECTS) {
    if (project.deployment?.t === "public" && project.deployment.url) {
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

  console.log(`\n🔍 Health Check: ${urls.length} URL(s)\n`);
  console.log(
    `   timeout=${args.timeoutMs}ms, retries=${args.retries}, delay=${args.retryDelayMs}ms\n`,
  );
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
