/**
 * Emit a GitHub Actions matrix (JSON) of every infra target that needs a
 * container image built (ghcr.io) and deployed to Fly.io.
 *
 * Build paths come from each project's `deploy.build` block in `projects.ts`:
 *   - checkoutDir → "projects/<dir>" (defaults to repo basename)
 *   - context     → "<checkout>/<context>" (defaults to "<checkout>")
 *   - dockerfile  → "<context>/Dockerfile" by default
 *
 * Used by `deploy-pipeline.yml` (`prepare` job) and as a local CLI. The
 * project list is never hardcoded in workflow YAML.
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
 *   bun run scripts/generate-deploy-matrix.ts --id normalizer-app
 *   bun run scripts/generate-deploy-matrix.ts --github-output
 */
import { appendFileSync } from "node:fs";
import {
  flyAppName,
  PORTFOLIO_INFRA_TARGET,
  getDeployableProjects,
  type DeploySpec,
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

function parseArgs(argv: readonly string[]): {
  pretty: boolean;
  owner: string;
  projectId: string;
  githubOutput: boolean;
} {
  let pretty = false;
  let githubOutput = false;
  let projectId = (process.env["PROJECT_ID"] ?? "").trim();
  let owner =
    process.env["GITHUB_REPOSITORY_OWNER"]?.trim() ||
    process.env["GHCR_OWNER"]?.trim() ||
    "crvouga";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--pretty") pretty = true;
    else if (arg === "--github-output") githubOutput = true;
    else if (arg === "--owner") owner = argv[++i] ?? owner;
    else if (arg === "--id") projectId = argv[++i] ?? projectId;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/generate-deploy-matrix.ts [--pretty] [--owner <gh-owner>] [--id <project-id>] [--github-output]",
      );
      process.exit(0);
    }
  }
  return { pretty, owner: owner.toLowerCase(), projectId, githubOutput };
}

function imageRepoFor(owner: string, id: string): string {
  return `ghcr.io/${owner}/chrisvouga-${id}`;
}

function repoBasename(githubRepo: string): string {
  return githubRepo.split("/").pop()!;
}

/**
 * Resolve the build paths for a deployable project (the portfolio is handled
 * separately because it builds in-place).
 *
 *   checkoutDir defaults to the repo basename
 *   context     defaults to "."
 *   dockerfile  defaults to "<context>/Dockerfile"
 *
 * All returned paths are relative to the workflow checkout root.
 */
function resolveBuildPaths(
  deploy: DeploySpec,
): { checkoutPath: string; buildContext: string; dockerfile: string } {
  const checkoutDir = deploy.build?.checkoutDir ?? repoBasename(deploy.githubRepo);
  const checkoutPath = `projects/${checkoutDir}`;

  const relativeContext = deploy.build?.context ?? ".";
  const buildContext =
    relativeContext === "." ? checkoutPath : `${checkoutPath}/${relativeContext}`;

  const dockerfile = deploy.build?.dockerfile
    ? `${checkoutPath}/${deploy.build.dockerfile}`
    : `${buildContext}/Dockerfile`;

  return { checkoutPath, buildContext, dockerfile };
}

function toMatrixInclude(owner: string, projectId: string): readonly MatrixInclude[] {
  const includes: MatrixInclude[] = [];

  // Portfolio is special: built from the repo root in-place, so checkout_path
  // is "." and there is no remote repo to clone.
  includes.push({
    id: PORTFOLIO_INFRA_TARGET.id,
    fly_app: flyAppName(PORTFOLIO_INFRA_TARGET.id),
    hostname: PORTFOLIO_INFRA_TARGET.deploy.hostname,
    port: PORTFOLIO_INFRA_TARGET.deploy.port,
    checkout_repo: "",
    checkout_path: ".",
    build_context: ".",
    dockerfile: "./Dockerfile",
    image_repo: imageRepoFor(owner, PORTFOLIO_INFRA_TARGET.id),
  });

  for (const project of getDeployableProjects()) {
    const { checkoutPath, buildContext, dockerfile } = resolveBuildPaths(project.deploy);
    includes.push({
      id: project.id,
      fly_app: flyAppName(project.id),
      hostname: project.deploy.hostname,
      port: project.deploy.port,
      checkout_repo: project.deploy.githubRepo,
      checkout_path: checkoutPath,
      build_context: buildContext,
      dockerfile,
      image_repo: imageRepoFor(owner, project.id),
    });
  }

  if (projectId) {
    const row = includes.find((r) => r.id === projectId);
    if (!row) {
      console.error(`::error::project id "${projectId}" is not a known deploy target`);
      process.exit(2);
    }
    return [row];
  }

  return includes;
}

function writeGithubOutput(matrix: { include: readonly MatrixInclude[] }): void {
  const file = process.env["GITHUB_OUTPUT"];
  const payload = JSON.stringify(matrix);
  if (file) {
    appendFileSync(file, `matrix<<__MATRIX_EOF__\n${payload}\n__MATRIX_EOF__\n`);
  } else {
    console.log(`::set-output name=matrix::${payload}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const matrix = { include: toMatrixInclude(args.owner, args.projectId) };

if (args.githubOutput) {
  writeGithubOutput(matrix);
} else if (args.pretty) {
  console.log(JSON.stringify(matrix, null, 2));
} else {
  console.log(JSON.stringify(matrix));
}
