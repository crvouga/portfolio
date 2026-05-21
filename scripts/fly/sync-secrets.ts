/**
 * Push every secret declared in `projects.ts` into the matching Fly app.
 *
 * Resolution order for each `secrets[]` entry on a target:
 *   1. Per-project source (`projectSecretSource`):
 *        - "computed":   re-derived from the project on every run (idempotent).
 *        - "generated":  random; SET ONCE then preserved across deploys
 *                        (skipped if Fly already has it staged).
 *   2. GitHub Actions repo secret allow-list (read from `process.env`).
 *   3. Hardcoded fallbacks (e.g. Pickflix legacy noops).
 *
 * Uses `fly secrets set --stage` so multiple values batch into a single
 * machine restart at the next deploy.
 *
 * Usage:
 *   bun run scripts/fly/sync-secrets.ts                       # every target
 *   bun run scripts/fly/sync-secrets.ts --id normalizer-app
 *   bun run scripts/fly/sync-secrets.ts --dry-run
 *   bun run scripts/fly/sync-secrets.ts --id normalizer-app \
 *       --regenerate OBJECT_STORE_PRESIGNED_URL_SECRET   # force rotation
 */
import { ensureFlyAuth, flyAppExists, flyctl, flyctlJson } from "../lib/flyctl.js";
import {
  buildDeployTargets,
  findTargetById,
  GITHUB_REPO_APP_SECRETS,
  hardcodedSecretValue,
  isGithubRepoAppSecret,
  projectSecretSource,
  type DeployTarget,
} from "../lib/project-targets.js";

type Args = {
  readonly ids: readonly string[];
  readonly dryRun: boolean;
  /** Names of "generated" secrets to force-rotate on this run. */
  readonly regenerate: ReadonlySet<string>;
};

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  const regenerate = new Set<string>();
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--regenerate") regenerate.add(argv[++i] ?? "");
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/fly/sync-secrets.ts " +
          "[--id <id> ...] [--regenerate <SECRET_NAME> ...] [--dry-run]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { ids: ids.filter(Boolean), dryRun, regenerate };
}

function targetsFromArgs(args: Args): readonly DeployTarget[] {
  if (args.ids.length === 0) return buildDeployTargets();
  const out: DeployTarget[] = [];
  for (const id of args.ids) {
    const t = findTargetById(id);
    if (!t) {
      console.error(`No infra target with id "${id}"`);
      process.exit(1);
    }
    out.push(t);
  }
  return out;
}

type FlyExistingSecret = { readonly Name: string };

/**
 * Names of secrets currently set on the Fly app. Returns null if the app
 * doesn't exist yet (first deploy) so callers know everything is "new".
 */
function existingFlySecretNames(target: DeployTarget): ReadonlySet<string> | null {
  if (!flyAppExists(target.flyApp)) return null;
  try {
    const list = flyctlJson<FlyExistingSecret[]>(["secrets", "list"], { app: target.flyApp });
    return new Set(list.map((s) => s.Name));
  } catch (err) {
    console.warn(
      `  ${target.id}: could not list existing secrets (${
        err instanceof Error ? err.message : String(err)
      }); treating as empty`,
    );
    return new Set();
  }
}

type SecretResolution =
  | { readonly status: "set"; readonly value: string; readonly source: "computed" | "generated" | "github" | "hardcoded" }
  | { readonly status: "preserved"; readonly source: "generated" } // already on Fly, leave it alone
  | { readonly status: "missing"; readonly githubSecret: string };

function resolveSecret(
  target: DeployTarget,
  secretName: string,
  existingNames: ReadonlySet<string> | null,
  forceRegenerate: ReadonlySet<string>,
): SecretResolution {
  const projectSource = projectSecretSource(target.id, secretName);
  if (projectSource) {
    if (projectSource.t === "computed") {
      return { status: "set", value: projectSource.compute(target), source: "computed" };
    }
    // generated: only set if not already present on the Fly app, OR if the
    // user explicitly asked for a rotation via --regenerate.
    const alreadySet = existingNames?.has(secretName) ?? false;
    if (alreadySet && !forceRegenerate.has(secretName)) {
      return { status: "preserved", source: "generated" };
    }
    return { status: "set", value: projectSource.generate(), source: "generated" };
  }

  if (isGithubRepoAppSecret(secretName)) {
    const value = process.env[secretName]?.trim();
    if (value) return { status: "set", value, source: "github" };
    return { status: "missing", githubSecret: secretName };
  }

  const hardcoded = hardcodedSecretValue(target.id, secretName);
  if (hardcoded != null) return { status: "set", value: hardcoded, source: "hardcoded" };

  // Last-chance: maybe an env var with the literal name was set in CI.
  const fromEnv = process.env[secretName]?.trim();
  if (fromEnv) return { status: "set", value: fromEnv, source: "github" };

  return { status: "missing", githubSecret: secretName };
}

type SyncOutcome = {
  readonly applied: number;
  readonly preserved: number;
  readonly missing: readonly string[];
  readonly bySource: Readonly<Record<"computed" | "generated" | "github" | "hardcoded", number>>;
};

function syncTargetSecrets(
  target: DeployTarget,
  args: Args,
): SyncOutcome {
  const missing: string[] = [];
  const pairs: string[] = [];
  const bySource = { computed: 0, generated: 0, github: 0, hardcoded: 0 };
  let preserved = 0;

  // Fetch the existing secret list ONCE per target. Cheap; one flyctl call.
  // Skip when there are no project-source ("generated") secrets in play.
  const hasGenerated = target.secrets.some(
    (n) => projectSecretSource(target.id, n)?.t === "generated",
  );
  const existingNames = hasGenerated ? existingFlySecretNames(target) : null;

  for (const name of target.secrets) {
    const resolved = resolveSecret(target, name, existingNames, args.regenerate);
    if (resolved.status === "missing") {
      missing.push(resolved.githubSecret);
      continue;
    }
    if (resolved.status === "preserved") {
      preserved += 1;
      continue;
    }
    pairs.push(`${name}=${resolved.value}`);
    bySource[resolved.source] += 1;
  }

  if (pairs.length === 0) {
    return { applied: 0, preserved, missing, bySource };
  }
  if (!args.dryRun) {
    flyctl(["secrets", "set", "--stage", ...pairs], { app: target.flyApp });
  }
  return { applied: pairs.length, preserved, missing, bySource };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureFlyAuth();
  const targets = targetsFromArgs(args);
  console.log(
    `Fly secrets sync (${args.dryRun ? "DRY-RUN" : "APPLY"}) — ` +
      `targets=${targets.length}, github-repo-secrets=${GITHUB_REPO_APP_SECRETS.length}` +
      (args.regenerate.size > 0 ? `, regenerate=[${[...args.regenerate].join(",")}]` : ""),
  );

  const totals = { applied: 0, preserved: 0, missing: 0, errors: 0 };
  for (const target of targets) {
    if (target.secrets.length === 0) {
      console.log(`  ${target.id.padEnd(40)} (no secrets)`);
      continue;
    }
    try {
      const outcome = syncTargetSecrets(target, args);
      totals.applied += outcome.applied;
      totals.preserved += outcome.preserved;
      totals.missing += outcome.missing.length;
      const parts: string[] = [
        `${outcome.applied}/${target.secrets.length} secrets staged`,
      ];
      if (outcome.preserved > 0) parts.push(`${outcome.preserved} preserved`);
      const sourceBits = Object.entries(outcome.bySource)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`);
      if (sourceBits.length > 0) parts.push(`(${sourceBits.join(", ")})`);
      if (outcome.missing.length > 0) parts.push(`MISSING: ${outcome.missing.join(", ")}`);
      console.log(`  ${target.id.padEnd(40)} ${parts.join(" ")}`);
    } catch (err) {
      totals.errors += 1;
      console.error(`  ${target.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\nSummary: applied=${totals.applied}, preserved=${totals.preserved}, ` +
      `missing=${totals.missing}, errors=${totals.errors}`,
  );
  if (totals.errors > 0 || totals.missing > 0) process.exit(1);
}

main();
