import { spawnSync } from "node:child_process";
import { ghaOutput, env, requiredEnv } from "./github-actions.js";

const PORTFOLIO_FILE_PATHS = new Set(["Dockerfile", "package.json", "bun.lock", "tsconfig.json"]);
const PORTFOLIO_DIR_PREFIXES = ["src/", "public/"];

function isPortfolioFile(path: string): boolean {
  if (PORTFOLIO_FILE_PATHS.has(path)) return true;
  return PORTFOLIO_DIR_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function diffNames(beforeSha: string, afterSha: string): string[] {
  const result = spawnSync("git", ["diff", "--name-only", beforeSha, afterSha], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git diff failed").trim());
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main(): void {
  const before = env("BEFORE_SHA");
  const after = requiredEnv("GITHUB_SHA");

  // First push/new history: can't diff safely; treat as changed.
  if (!before || /^0+$/.test(before)) {
    ghaOutput("portfolio", "true");
    return;
  }

  let changed = true;
  try {
    const files = diffNames(before, after);
    changed = files.some(isPortfolioFile);
  } catch {
    // If diff fails, rebuild conservatively.
    changed = true;
  }
  ghaOutput("portfolio", changed ? "true" : "false");
}

main();
