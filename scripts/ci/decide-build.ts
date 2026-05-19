import { spawnSync } from "node:child_process";
import {
  boolEnv,
  env,
  ghaOutput,
  isTransientNetworkError,
  requiredEnv,
  runWithRetries,
} from "./github-actions.js";

function gitHead(path: string): string {
  const result = spawnSync("git", ["-C", path, "rev-parse", "HEAD"], {
    stdio: "pipe",
    encoding: "utf-8",
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "git rev-parse failed").trim());
  }
  return result.stdout.trim();
}

function main(): void {
  const ghcrImage = requiredEnv("GHCR_IMAGE").toLowerCase();
  const matrixId = requiredEnv("MATRIX_ID");
  const checkoutRepo = env("CHECKOUT_REPO");
  const checkoutPath = env("CHECKOUT_PATH");
  const portfolioChanged = boolEnv("PORTFOLIO_CHANGED");
  const forceRebuild = boolEnv("FORCE_REBUILD");

  if (forceRebuild) {
    ghaOutput("build", "true");
    ghaOutput("reason", "force_rebuild");
    return;
  }

  let contentSha = "";
  if (!checkoutRepo) {
    if (!portfolioChanged) {
      ghaOutput("build", "false");
      ghaOutput("reason", "portfolio paths unchanged");
      return;
    }
    contentSha = requiredEnv("GITHUB_SHA");
  } else {
    contentSha = gitHead(checkoutPath);
  }

  ghaOutput("content_sha", contentSha);
  const inspectResult = runWithRetries(
    "docker",
    ["buildx", "imagetools", "inspect", `${ghcrImage}:${matrixId}-${contentSha}`],
    3,
    isTransientNetworkError,
  );
  const exists = inspectResult.status === 0;
  if (exists) {
    ghaOutput("build", "false");
    ghaOutput("reason", `image ${matrixId}-${contentSha} already in GHCR`);
    return;
  }

  ghaOutput("build", "true");
  ghaOutput("reason", `new content ${contentSha}`);
}

main();
