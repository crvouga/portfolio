import {
  ghaOutput,
  isTransientNetworkError,
  requiredEnv,
  runWithRetries,
} from "./github-actions.js";

function main(): void {
  const ghcrImage = requiredEnv("GHCR_IMAGE").toLowerCase();
  const matrixId = requiredEnv("MATRIX_ID");
  const dockerfile = requiredEnv("MATRIX_DOCKERFILE");
  const buildContext = requiredEnv("MATRIX_BUILD_CONTEXT");
  const contentSha = requiredEnv("CONTENT_SHA");

  const args = [
    "buildx",
    "build",
    "--platform",
    "linux/amd64",
    "--file",
    dockerfile,
    "--tag",
    `${ghcrImage}:${matrixId}-latest`,
    "--tag",
    `${ghcrImage}:${matrixId}-${contentSha}`,
    "--push",
    buildContext,
  ];
  const result = runWithRetries("docker", args, 3, isTransientNetworkError);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  ghaOutput("image", `${ghcrImage}:${matrixId}-latest`);
}

main();
