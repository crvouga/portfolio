/**
 * Decide what the unified Deploy Pipeline workflow should run this time.
 *
 *   - Reads GitHub Actions context from env (event_name, before SHA, dispatch
 *     inputs).
 *   - Diffs changed files since the previous commit on the branch.
 *   - Emits GA outputs the workflow consumes to skip jobs it doesn't need:
 *
 *       image_tag      Deploy image tag (default: github.sha; override via
 *                      dispatch input image_tag).
 *       build_matrix   GitHub Actions matrix JSON. Empty include → build job
 *                      is skipped entirely.
 *       deploy_matrix  Same shape; each row carries its own `image_tag` so
 *                      projects that didn't rebuild this run deploy `:latest`
 *                      while just-built rows pin to the new sha.
 *       has_build      true when build_matrix is non-empty.
 *       has_deploy     true when deploy_matrix is non-empty.
 *       run_zones      true → cloudflare-zones job runs (dispatch only).
 *       run_dns        true → cloudflare-dns-sync job runs.
 *       run_bootstrap  true → fly-bootstrap job runs (idempotent; default true
 *                      on dispatch + on push when projects.ts changed).
 *
 *   - Also writes a human-readable summary to $GITHUB_STEP_SUMMARY.
 *
 * Idempotency: this script never mutates anything; downstream scripts remain
 * the only mutation layer.
 *
 * Usage (local):
 *   GHCR_OWNER=crvouga \
 *   GH_EVENT_NAME=push \
 *   GH_EVENT_BEFORE=<sha> GH_SHA=HEAD \
 *   bun run scripts/ci/plan-pipeline.ts
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import {
  flyAppName,
  PORTFOLIO_INFRA_TARGET,
  getDeployableProjects,
  type DeploySpec,
} from "../../projects.js";

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
  readonly image_tag: string;
};

type BootstrapMode = "none" | "zones" | "apps" | "both";

type DispatchInputs = {
  readonly projectId: string;
  readonly imageTag: string;
  readonly forceBuild: boolean;
  readonly skipBuild: boolean;
  readonly bootstrapMode: BootstrapMode;
};

type Inputs = {
  readonly eventName: string;
  readonly before: string;
  readonly sha: string;
  readonly owner: string;
  readonly dispatch: DispatchInputs | null;
};

type Plan = {
  readonly imageTag: string;
  readonly buildIds: ReadonlySet<string>;
  readonly deployIds: ReadonlyMap<string, string>; // id → image_tag
  readonly runZones: boolean;
  readonly runDns: boolean;
  readonly runBootstrap: boolean;
  readonly reason: string;
};

const PORTFOLIO_ID = PORTFOLIO_INFRA_TARGET.id;
const FALLBACK_TAG = "latest";

function envFlag(name: string): boolean {
  const v = (process.env[name] ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function envStr(name: string): string {
  return (process.env[name] ?? "").trim();
}

function readInputs(): Inputs {
  const eventName = envStr("GH_EVENT_NAME") || envStr("GITHUB_EVENT_NAME") || "push";
  const before = envStr("GH_EVENT_BEFORE");
  const sha = envStr("GH_SHA") || envStr("GITHUB_SHA") || "HEAD";
  const owner = (
    envStr("GHCR_OWNER") ||
    envStr("GITHUB_REPOSITORY_OWNER") ||
    "crvouga"
  ).toLowerCase();

  if (eventName !== "workflow_dispatch") {
    return { eventName, before, sha, owner, dispatch: null };
  }

  const rawMode = (envStr("DISPATCH_BOOTSTRAP_MODE") || "none").toLowerCase();
  const bootstrapMode: BootstrapMode =
    rawMode === "zones" || rawMode === "apps" || rawMode === "both" ? rawMode : "none";

  return {
    eventName,
    before,
    sha,
    owner,
    dispatch: {
      projectId: envStr("DISPATCH_PROJECT_ID"),
      imageTag: envStr("DISPATCH_IMAGE_TAG"),
      forceBuild: envFlag("DISPATCH_FORCE_BUILD"),
      skipBuild: envFlag("DISPATCH_SKIP_BUILD"),
      bootstrapMode,
    },
  };
}

function imageRepoFor(owner: string, id: string): string {
  return `ghcr.io/${owner}/chrisvouga-${id}`;
}

function repoBasename(githubRepo: string): string {
  return githubRepo.split("/").pop()!;
}

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

function buildAllIncludes(owner: string, imageTag: string): readonly MatrixInclude[] {
  const includes: MatrixInclude[] = [];

  // Portfolio is built in-place from the repo root; no remote clone needed.
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
    image_tag: imageTag,
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
      image_tag: imageTag,
    });
  }

  return includes;
}

function gitShow(ref: string, path: string): string | null {
  const result = spawnSync("git", ["show", `${ref}:${path}`], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return null;
  return result.stdout;
}

function gitDiffNames(before: string, after: string): readonly string[] | null {
  const result = spawnSync(
    "git",
    ["diff", "--name-only", `${before}...${after}`],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) return null;
  return result.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

function extractProjectIds(source: string): Set<string> {
  const ids = new Set<string>();
  // Matches `id: "foo"` / `id: 'foo'` in the PROJECTS array entries.
  for (const m of source.matchAll(/^\s*id:\s*["']([a-z0-9-]+)["']/gm)) {
    ids.add(m[1]);
  }
  return ids;
}

function newlyAddedProjectIds(before: string, after: string): readonly string[] {
  if (!before || /^0+$/.test(before)) return []; // no parent; first push to branch
  const beforeSrc = gitShow(before, "projects.ts");
  const afterSrc = gitShow(after, "projects.ts") ?? readIfExists("projects.ts");
  if (!afterSrc) return [];
  const beforeIds = beforeSrc ? extractProjectIds(beforeSrc) : new Set<string>();
  const afterIds = extractProjectIds(afterSrc);
  return [...afterIds].filter((id) => !beforeIds.has(id));
}

function readIfExists(path: string): string | null {
  try {
    return existsSync(path) ? readFileSync(path, "utf-8") : null;
  } catch {
    return null;
  }
}

// Path → effect classification. Anything not matched is treated as "unknown",
// which triggers a safe full pipeline.
function classifyPath(path: string): "ignore" | "portfolio" | "deploy_all" | "unknown" {
  // Docs/screenshots/CI infra: never touch infra or builds.
  if (/\.(md|txt)$/i.test(path)) return "ignore";
  if (path.startsWith("public/")) return "ignore";
  if (path.startsWith(".vscode/")) return "ignore";
  if (path.startsWith(".cursor/")) return "ignore";
  if (path.startsWith("scripts/ci/")) return "ignore";
  if (path === ".gitignore" || path === ".editorconfig") return "ignore";

  // Portfolio rebuild + portfolio deploy.
  if (
    path === "Dockerfile" ||
    path === "package.json" ||
    path === "bun.lock" ||
    path === "tsconfig.json" ||
    path === "projects.ts" ||
    path.startsWith("src/")
  ) {
    return "portfolio";
  }

  // Touch every deploy target (re-run infra), no rebuild.
  if (
    path.startsWith("fly/") ||
    path.startsWith("scripts/fly/") ||
    path.startsWith("scripts/cloudflare/") ||
    path.startsWith("scripts/lib/") ||
    path.startsWith(".github/workflows/") ||
    path === "scripts/check-github-secrets.ts" ||
    path === "scripts/generate-deploy-matrix.ts" ||
    path === "scripts/health-check-urls.ts"
  ) {
    return "deploy_all";
  }

  return "unknown";
}

function plan(inputs: Inputs): Plan {
  const allTargets = buildAllIncludes(inputs.owner, FALLBACK_TAG);
  const allIds = new Set(allTargets.map((t) => t.id));
  const tagFromSha = inputs.sha === "HEAD" ? "latest" : inputs.sha;
  const imageTag = inputs.dispatch?.imageTag || tagFromSha;

  const buildIds = new Set<string>();
  const deployIds = new Map<string, string>();
  const notes: string[] = [];

  // --- Dispatch path: explicit operator intent wins. ---
  if (inputs.dispatch) {
    const d = inputs.dispatch;
    const filterId = d.projectId.trim();
    notes.push(`workflow_dispatch with bootstrap_mode=${d.bootstrapMode}`);

    const candidateIds = filterId ? [filterId] : [...allIds];
    if (filterId && !allIds.has(filterId)) {
      console.error(`::error::project_id "${filterId}" is not a known infra target`);
      process.exit(2);
    }

    for (const id of candidateIds) {
      if (!d.skipBuild) buildIds.add(id);
      // Each dispatched target deploys at the chosen image_tag, whether
      // freshly built or pulled from an existing tag.
      deployIds.set(id, imageTag);
    }

    return {
      imageTag,
      buildIds,
      deployIds,
      runZones: d.bootstrapMode === "zones" || d.bootstrapMode === "both",
      runBootstrap: d.bootstrapMode === "apps" || d.bootstrapMode === "both",
      runDns: true,
      reason: notes.concat(
        `build=${[...buildIds].length || "skipped"}`,
        `deploy=${deployIds.size}`,
      ).join("; "),
    };
  }

  // --- Push path: derive from changed files. ---
  const diff = inputs.before ? gitDiffNames(inputs.before, inputs.sha) : null;
  const changedFiles = diff ?? [];
  const diffOk = diff !== null;

  // Fallback: full pipeline if we couldn't compute a reliable diff (e.g. force
  // push, very first commit on the branch). Safer to over-run than miss work.
  if (!diffOk) {
    notes.push("git diff unavailable; defaulting to full pipeline");
    for (const id of allIds) {
      buildIds.add(id);
      deployIds.set(id, imageTag);
    }
    return {
      imageTag,
      buildIds,
      deployIds,
      runZones: false,
      runBootstrap: true,
      runDns: true,
      reason: notes.join("; "),
    };
  }

  notes.push(`${changedFiles.length} changed file(s) vs ${inputs.before.slice(0, 7)}`);

  let touchPortfolio = false;
  let touchAll = false;
  let touchUnknown = false;

  for (const file of changedFiles) {
    const kind = classifyPath(file);
    if (kind === "portfolio") touchPortfolio = true;
    else if (kind === "deploy_all") touchAll = true;
    else if (kind === "unknown") touchUnknown = true;
  }

  if (touchUnknown) {
    notes.push("unknown path(s) changed — defaulting to portfolio rebuild + deploy all");
    touchPortfolio = true;
    touchAll = true;
  }

  if (touchPortfolio) {
    buildIds.add(PORTFOLIO_ID);
    deployIds.set(PORTFOLIO_ID, imageTag);
  }

  if (touchAll) {
    for (const id of allIds) {
      // Deploy at :latest for targets we are NOT rebuilding so they pick up
      // the existing image; freshly-built rows still deploy at imageTag.
      if (!deployIds.has(id)) deployIds.set(id, FALLBACK_TAG);
    }
  }

  // Brand-new projects in projects.ts → must build + deploy them, otherwise
  // the deploy will try to pull a tag that doesn't exist yet.
  if (changedFiles.includes("projects.ts")) {
    const fresh = newlyAddedProjectIds(inputs.before, inputs.sha);
    for (const id of fresh) {
      if (!allIds.has(id)) continue; // not deployable
      buildIds.add(id);
      deployIds.set(id, imageTag);
      notes.push(`new project ${id}`);
    }
  }

  // Anything we're building this run must deploy from the freshly-built tag,
  // even if a deploy_all rule already wrote :latest for it.
  for (const id of buildIds) deployIds.set(id, imageTag);

  return {
    imageTag,
    buildIds,
    deployIds,
    runZones: false,
    runBootstrap: changedFiles.includes("projects.ts"),
    runDns: true,
    reason: notes.join("; "),
  };
}

function asMatrix(
  ids: Iterable<string>,
  tagFor: (id: string) => string,
  owner: string,
): { include: MatrixInclude[] } {
  const idSet = new Set(ids);
  const all = buildAllIncludes(owner, "");
  const include = all
    .filter((row) => idSet.has(row.id))
    .map((row) => ({ ...row, image_tag: tagFor(row.id) }));
  return { include };
}

function writeOutputs(outputs: Record<string, string>): void {
  const file = process.env["GITHUB_OUTPUT"];
  if (file) {
    let chunk = "";
    for (const [key, value] of Object.entries(outputs)) {
      // Multiline-safe heredoc per GitHub Actions docs.
      chunk += `${key}<<__PLAN_EOF__\n${value}\n__PLAN_EOF__\n`;
    }
    appendFileSync(file, chunk);
  } else {
    for (const [key, value] of Object.entries(outputs)) {
      console.log(`::set-output name=${key}::${value}`);
    }
  }
}

function writeSummary(plan: Plan, inputs: Inputs): void {
  const file = process.env["GITHUB_STEP_SUMMARY"];
  const lines = [
    "## Pipeline plan",
    "",
    `- **event:** \`${inputs.eventName}\``,
    `- **image_tag:** \`${plan.imageTag}\``,
    `- **build:** ${plan.buildIds.size === 0 ? "_skipped_" : [...plan.buildIds].sort().map((id) => `\`${id}\``).join(", ")}`,
    `- **deploy:** ${plan.deployIds.size === 0 ? "_skipped_" : [...plan.deployIds.keys()].sort().map((id) => `\`${id}\`(${plan.deployIds.get(id)})`).join(", ")}`,
    `- **run_zones:** ${plan.runZones}`,
    `- **run_dns:** ${plan.runDns}`,
    `- **run_bootstrap:** ${plan.runBootstrap}`,
    `- **reason:** ${plan.reason || "_n/a_"}`,
    "",
  ];
  const text = lines.join("\n");
  if (file) appendFileSync(file, text);
  else console.log(text);
}

const inputs = readInputs();
const result = plan(inputs);

const buildMatrix = asMatrix(result.buildIds, () => result.imageTag, inputs.owner);
const deployMatrix = asMatrix(
  result.deployIds.keys(),
  (id) => result.deployIds.get(id) ?? result.imageTag,
  inputs.owner,
);

writeOutputs({
  image_tag: result.imageTag,
  build_matrix: JSON.stringify(buildMatrix),
  deploy_matrix: JSON.stringify(deployMatrix),
  has_build: String(buildMatrix.include.length > 0),
  has_deploy: String(deployMatrix.include.length > 0),
  run_zones: String(result.runZones),
  run_dns: String(result.runDns),
  run_bootstrap: String(result.runBootstrap),
});

writeSummary(result, inputs);
