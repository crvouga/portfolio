/**
 * Emit a GitHub Actions matrix (JSON) of every infra target that needs a
 * container image built and pushed to ECR.
 *
 * Used by `build-and-publish-images.yml` to fan out builds without hardcoding
 * the project list in YAML.
 *
 * Output shape:
 *   { "include": [
 *     { "id": "portfolio", "checkout_repo": "", "checkout_path": ".", ...},
 *     ...
 *   ]}
 *
 * Usage:
 *   bun run scripts/generate-aws-deploy-matrix.ts
 *   bun run scripts/generate-aws-deploy-matrix.ts --pretty
 */
import { getDeployableProjects, getInfraTargets, PORTFOLIO_INFRA_TARGET } from "../projects.js";

type MatrixInclude = {
  readonly id: string;
  readonly hostname: string;
  readonly port: number;
  /** GitHub repository to clone for the source. Empty string means use the current repo (portfolio). */
  readonly checkout_repo: string;
  /** Path under $GITHUB_WORKSPACE where the source is checked out. */
  readonly checkout_path: string;
  /** Path passed to `docker buildx build` as the build context. */
  readonly build_context: string;
  /** Path to the project's Dockerfile relative to $GITHUB_WORKSPACE. */
  readonly dockerfile: string;
};

const PER_PROJECT_DOCKER_CONTEXT: Record<string, { context: string; dockerfile: string }> = {
  "headless-combobox-svelte-example": {
    context: "projects/headless-combobox/example/svelte",
    dockerfile: "projects/headless-combobox/example/svelte/Dockerfile",
  },
};

const PER_PROJECT_REPO_PATH: Record<string, string> = {
  pickflix: "pickflix-v1",
  "todo-app": "todo-v1",
  "anime-blog": "anime",
};

function checkoutPath(id: string, githubRepo: string): string {
  const override = PER_PROJECT_REPO_PATH[id];
  if (override) return `projects/${override}`;
  return `projects/${githubRepo.split("/").pop()!}`;
}

function dockerContext(id: string, checkoutPathStr: string): { context: string; dockerfile: string } {
  const override = PER_PROJECT_DOCKER_CONTEXT[id];
  if (override) return override;
  return { context: checkoutPathStr, dockerfile: `${checkoutPathStr}/Dockerfile` };
}

function toMatrixInclude(): readonly MatrixInclude[] {
  const includes: MatrixInclude[] = [];

  includes.push({
    id: PORTFOLIO_INFRA_TARGET.id,
    hostname: PORTFOLIO_INFRA_TARGET.hostname,
    port: PORTFOLIO_INFRA_TARGET.port,
    checkout_repo: "",
    checkout_path: ".",
    build_context: ".",
    dockerfile: "./Dockerfile",
  });

  for (const project of getDeployableProjects()) {
    const path = checkoutPath(project.id, project.githubRepo);
    const { context, dockerfile } = dockerContext(project.id, path);
    includes.push({
      id: project.id,
      hostname: project.hostname,
      port: project.port,
      checkout_repo: project.githubRepo,
      checkout_path: path,
      build_context: context,
      dockerfile,
    });
  }

  return includes;
}

const pretty = process.argv.includes("--pretty");
const matrix = { include: toMatrixInclude() };

if (pretty) {
  console.log(JSON.stringify(matrix, null, 2));
} else {
  console.log(JSON.stringify(matrix));
}

void getInfraTargets; // keep import live for tooling
