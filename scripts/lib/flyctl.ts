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

export function flyctl(args: readonly string[], options: FlyctlOptions = {}): FlyctlResult {
  const result = runFlyctl(args, options);
  if (result.exitCode !== 0) {
    throw new FlyctlError(args, result);
  }
  return result;
}

/** Same as `flyctl` but returns the exit code instead of throwing. */
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
