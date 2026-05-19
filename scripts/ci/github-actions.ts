import { appendFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function env(name: string): string {
  return process.env[name] ?? "";
}

export function requiredEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function boolEnv(name: string): boolean {
  return env(name).toLowerCase() === "true";
}

export function ghaOutput(name: string, value: string): void {
  const output = process.env["GITHUB_OUTPUT"];
  if (!output) return;
  appendFileSync(output, `${name}=${value}\n`);
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export type CommandResult = {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
};

export function runCommand(command: string, args: readonly string[]): CommandResult {
  const result = spawnSync(command, [...args], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  return { status: result.status, stdout, stderr };
}

export function runWithRetries(
  command: string,
  args: readonly string[],
  maxAttempts: number,
  shouldRetry: (result: CommandResult) => boolean,
): CommandResult {
  let last: CommandResult = { status: 1, stdout: "", stderr: "" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      console.log(`Retry ${attempt}/${maxAttempts}: ${command} ${args.join(" ")}`);
    }
    last = runCommand(command, args);
    if (last.status === 0) return last;
    if (!shouldRetry(last) || attempt === maxAttempts) return last;
  }
  return last;
}

export function isTransientNetworkError(result: CommandResult): boolean {
  const text = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return (
    text.includes("client.timeout exceeded while awaiting headers") ||
    text.includes("context deadline exceeded") ||
    text.includes("request canceled") ||
    text.includes("tls handshake timeout") ||
    text.includes("timeout")
  );
}
