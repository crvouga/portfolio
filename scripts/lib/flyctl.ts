/**
 * Thin wrapper around the `flyctl` (Fly.io) CLI.
 *
 * - Uses `--json` whenever flyctl supports it for machine-parseable output.
 * - Surfaces stdout/stderr verbatim on failure so CI logs are useful.
 * - All Fly-related scripts go through here so we only have one place to swap
 *   between subprocess and Fly's GraphQL/REST API later.
 *
 * Auth: flyctl reads `FLY_API_TOKEN` from the environment automatically.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";

export type FlyctlOptions = {
  /** Add `--app <app>` to the command. */
  readonly app?: string;
  /** Add `--json` and parse stdout. Default false. */
  readonly json?: boolean;
  /** Working directory for the command. */
  readonly cwd?: string;
  /** Extra env vars merged into process.env. */
  readonly env?: Record<string, string>;
  /** Capture stdout instead of streaming to console. Default true. */
  readonly capture?: boolean;
  /** Pipe stdin from this string. */
  readonly stdin?: string;
};

export type FlyctlResult = {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
};

const FLY_BIN = process.env["FLYCTL_BIN"]?.trim() || "flyctl";

function runFlyctl(args: readonly string[], options: FlyctlOptions): FlyctlResult {
  const fullArgs = [...args];
  if (options.app && !fullArgs.includes("--app") && !fullArgs.includes("-a")) {
    fullArgs.push("--app", options.app);
  }
  if (options.json && !fullArgs.includes("--json") && !fullArgs.includes("-j")) {
    fullArgs.push("--json");
  }

  const capture = options.capture ?? true;
  const result: SpawnSyncReturns<string> = spawnSync(FLY_BIN, fullArgs, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf-8",
    stdio: capture
      ? ["pipe", "pipe", "pipe"]
      : ["inherit", "inherit", "inherit"],
    input: options.stdin,
  });

  if (result.error) {
    throw new Error(
      `Failed to spawn ${FLY_BIN}: ${result.error.message}. ` +
        "Install flyctl from https://fly.io/docs/flyctl/install/.",
    );
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

export class FlyctlError extends Error {
  constructor(
    readonly args: readonly string[],
    readonly result: FlyctlResult,
  ) {
    super(
      `flyctl ${args.join(" ")} failed (exit ${result.exitCode}): ${
        result.stderr.trim() || result.stdout.trim() || "unknown error"
      }`,
    );
    this.name = "FlyctlError";
  }
}

/**
 * Indicators that the failure was a transient network/server error from
 * Fly's API and the command is safe to retry.
 *
 * We only retry on these — never on auth failures, validation errors, or
 * "app not found" since retrying would just hide a real bug.
 */
const TRANSIENT_ERROR_PATTERNS: readonly RegExp[] = [
  /connection reset by peer/i,
  /broken pipe/i,
  /i\/o timeout/i,
  /network is unreachable/i,
  /no such host/i,
  /tls handshake timeout/i,
  /unexpected EOF/i,
  /http2: server sent GOAWAY/i,
  /context deadline exceeded/i,
  /\b(502|503|504)\b/, // bad gateway / service unavailable / gateway timeout
  /server error/i,
  /try again/i,
  /temporarily unavailable/i,
];

function isTransientFailure(result: FlyctlResult): boolean {
  if (result.exitCode === 0) return false;
  const haystack = `${result.stdout}\n${result.stderr}`;
  return TRANSIENT_ERROR_PATTERNS.some((re) => re.test(haystack));
}

function sleepSync(ms: number): void {
  // Synchronous sleep using a SharedArrayBuffer + Atomics.wait so this works
  // inside non-async helpers. Cheap to allocate; only called on retry.
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1_500;

export function flyctl(args: readonly string[], options: FlyctlOptions = {}): FlyctlResult {
  let result: FlyctlResult | undefined;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    result = runFlyctl(args, options);
    if (result.exitCode === 0) return result;
    if (attempt === MAX_RETRIES || !isTransientFailure(result)) {
      throw new FlyctlError(args, result);
    }
    const backoff = BASE_BACKOFF_MS * 2 ** attempt;
    console.warn(
      `  flyctl ${args[0] ?? ""} ${args[1] ?? ""} hit a transient error ` +
        `(attempt ${attempt + 1}/${MAX_RETRIES + 1}); retrying in ${backoff}ms… ` +
        `[${(result.stderr || result.stdout).trim().split("\n").pop() ?? ""}]`,
    );
    sleepSync(backoff);
  }
  // Unreachable but keeps the type checker happy.
  throw new FlyctlError(args, result!);
}

/** Same as `flyctl` but returns the exit code instead of throwing. No retry. */
export function flyctlSafe(args: readonly string[], options: FlyctlOptions = {}): FlyctlResult {
  return runFlyctl(args, options);
}

/** Run a flyctl command with `--json` and parse stdout into T. */
export function flyctlJson<T>(args: readonly string[], options: FlyctlOptions = {}): T {
  const result = flyctl(args, { ...options, json: true });
  const trimmed = result.stdout.trim();
  if (trimmed === "") {
    throw new Error(`flyctl ${args.join(" ")} returned empty stdout`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse flyctl JSON output for "${args.join(" ")}": ${
        err instanceof Error ? err.message : String(err)
      }\nStdout: ${trimmed}`,
    );
  }
}

/** Returns true iff a Fly app with the given name exists in the user's org. */
export function flyAppExists(appName: string): boolean {
  const r = flyctlSafe(["status"], { app: appName, json: true });
  if (r.exitCode === 0) return true;
  const combined = `${r.stdout}\n${r.stderr}`.toLowerCase();
  if (combined.includes("not found") || combined.includes("could not find app")) {
    return false;
  }
  // Other errors (auth, network) — propagate.
  throw new FlyctlError(["status", "--app", appName], r);
}

export function ensureFlyAuth(): void {
  if (!process.env["FLY_API_TOKEN"]?.trim()) {
    throw new Error(
      "FLY_API_TOKEN is required. Get one with `flyctl auth token` and export it (or set as a GitHub repo secret).",
    );
  }
}
