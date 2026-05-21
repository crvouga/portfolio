/**
 * Emit a GitHub Actions matrix (JSON) of every infra target that needs a
 * container image built (ghcr.io) and deployed to Fly.io.
 *
 * Used by `build-and-publish-images.yml` and `deploy-pipeline.yml` so the
 * project list never has to be hardcoded in YAML.
 *
 * Output shape:
 *   { "include": [
 *     {
 *       "id": "portfolio",
 *       "fly_app": "chrisvouga-portfolio",
 *       "hostname": "www.chrisvouga.dev",
 *       "port": 80,
 *       "checkout_repo": "",
 *       "checkout_path": ".",
 *       "build_context": ".",
 *       "dockerfile": "./Dockerfile",
 *       "image_repo": "ghcr.io/<owner>/chrisvouga-portfolio"
 *     },
 *     ...
 *   ]}
 *
 * Usage:
 *   bun run scripts/generate-deploy-matrix.ts
 *   bun run scripts/generate-deploy-matrix.ts --pretty
 *   bun run scripts/generate-deploy-matrix.ts --owner crvouga
 */
import {
  flyAppName,
  getDeployableProjects,
  PORTFOLIO_INFRA_TARGET,
} from "../projects.js";

type MatrixInclude = {
  readonly id: string;
  readonly fly_app: string;
  readonly hostname: string;
  readonly port: number;
  readonly checkout_repo: string;
  readonly checkout_path: string;
  readonly build_context: string;
  readonly dockerfile: string;
  readonly image_repo: string;
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

function parseArgs(argv: readonly string[]): { pretty: boolean; owner: string } {
  let pretty = false;
  let owner =
    process.env["GITHUB_REPOSITORY_OWNER"]?.trim() ||
    process.env["GHCR_OWNER"]?.trim() ||
    "crvouga";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pretty") pretty = true;
    else if (arg === "--owner") owner = argv[++i] ?? owner;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/generate-deploy-matrix.ts [--pretty] [--owner <gh-owner>]");
      process.exit(0);
    }
  }
  return { pretty, owner: owner.toLowerCase() };
}

function imageRepoFor(owner: string, id: string): string {
  return `ghcr.io/${owner}/chrisvouga-${id}`;
}

function toMatrixInclude(owner: string): readonly MatrixInclude[] {
  const includes: MatrixInclude[] = [];

  includes.push({
    id: PORTFOLIO_INFRA_TARGET.id,
    fly_app: flyAppName(PORTFOLIO_INFRA_TARGET.id),
    hostname: PORTFOLIO_INFRA_TARGET.hostname,
    port: PORTFOLIO_INFRA_TARGET.port,
    checkout_repo: "",
    checkout_path: ".",
    build_context: ".",
    dockerfile: "./Dockerfile",
    image_repo: imageRepoFor(owner, PORTFOLIO_INFRA_TARGET.id),
  });

  for (const project of getDeployableProjects()) {
    const path = checkoutPath(project.id, project.githubRepo);
    const { context, dockerfile } = dockerContext(project.id, path);
    includes.push({
      id: project.id,
      fly_app: flyAppName(project.id),
      hostname: project.hostname,
      port: project.port,
      checkout_repo: project.githubRepo,
      checkout_path: path,
      build_context: context,
      dockerfile,
      image_repo: imageRepoFor(owner, project.id),
    });
  }

  return includes;
}

const args = parseArgs(process.argv.slice(2));
const matrix = { include: toMatrixInclude(args.owner) };

if (args.pretty) {
  console.log(JSON.stringify(matrix, null, 2));
} else {
  console.log(JSON.stringify(matrix));
}
