/**
 * Push every secret declared in `projects.ts` into the matching Fly app.
 *
 * - GitHub-backed secrets (TMDB / TWILIO_*) are read from process.env
 *   (the GitHub Actions workflow exposes them as env vars).
 * - Pickflix-style hardcoded fallbacks are inlined from project-targets.ts.
 * - Uses `fly secrets set --stage` to batch all values for a single app and
 *   only restart the machine once.
 *
 * Usage:
 *   bun run scripts/fly/sync-secrets.ts             # every target
 *   bun run scripts/fly/sync-secrets.ts --id pickflix
 *   bun run scripts/fly/sync-secrets.ts --dry-run
 */
import { ensureFlyAuth, flyctl } from "../lib/flyctl.js";
import {
  buildDeployTargets,
  findTargetById,
  GITHUB_REPO_APP_SECRETS,
  hardcodedSecretValue,
  isGithubRepoAppSecret,
  type DeployTarget,
} from "../lib/project-targets.js";

type Args = {
  readonly ids: readonly string[];
  readonly dryRun: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/fly/sync-secrets.ts [--id <id> ...] [--dry-run]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { ids: ids.filter(Boolean), dryRun };
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

type SecretResolution =
  | { readonly status: "set"; readonly value: string; readonly source: "github" | "hardcoded" }
  | { readonly status: "missing"; readonly githubSecret: string };

function resolveSecret(target: DeployTarget, secretName: string): SecretResolution {
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

function syncTargetSecrets(target: DeployTarget, dryRun: boolean): { applied: number; missing: string[] } {
  const missing: string[] = [];
  const pairs: string[] = [];
  for (const name of target.secrets) {
    const resolved = resolveSecret(target, name);
    if (resolved.status === "missing") {
      missing.push(resolved.githubSecret);
      continue;
    }
    pairs.push(`${name}=${resolved.value}`);
  }
  if (pairs.length === 0) return { applied: 0, missing };
  if (dryRun) return { applied: pairs.length, missing };
  flyctl(["secrets", "set", "--stage", ...pairs], { app: target.flyApp });
  return { applied: pairs.length, missing };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureFlyAuth();
  const targets = targetsFromArgs(args);
  console.log(
    `Fly secrets sync (${args.dryRun ? "DRY-RUN" : "APPLY"}) — targets=${targets.length}, github-repo-secrets=${GITHUB_REPO_APP_SECRETS.length}`,
  );

  const totals = { applied: 0, missing: 0, errors: 0 };
  for (const target of targets) {
    if (target.secrets.length === 0) {
      console.log(`  ${target.id.padEnd(40)} (no secrets)`);
      continue;
    }
    try {
      const { applied, missing } = syncTargetSecrets(target, args.dryRun);
      totals.applied += applied;
      totals.missing += missing.length;
      const note = missing.length > 0 ? ` MISSING: ${missing.join(", ")}` : "";
      console.log(`  ${target.id.padEnd(40)} ${applied}/${target.secrets.length} secrets staged${note}`);
    } catch (err) {
      totals.errors += 1;
      console.error(`  ${target.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\nSummary: applied=${totals.applied}, missing=${totals.missing}, errors=${totals.errors}`);
  if (totals.errors > 0 || totals.missing > 0) process.exit(1);
}

main();
