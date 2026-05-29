/**
 * Push every secret declared in `projects.ts` into the matching Fly app.
 *
 * The deploy spec on each project is the ONLY source of truth — there are
 * no fallback chains, hidden allow-lists, or per-project tables in this
 * script. Each `SecretSpec.source.t` resolves uniformly:
 *
 *   - "doppler":   process.env[name] (injected by `doppler run`).
 *   - "literal":   inline value verbatim.
 *   - "computed":  re-derived from the project on every sync.
 *   - "generated": SET ONCE per Fly app and PRESERVED across deploys
 *                  (skipped if Fly already has the name set).
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
  allDopplerSecretNames,
  buildDeployTargets,
  findTargetById,
  type DeployTarget,
} from "../lib/project-targets.js";
import type { SecretSpec } from "../../projects.js";

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

type SourceKind = "doppler" | "literal" | "computed" | "generated";

type SecretResolution =
  | { readonly status: "set"; readonly value: string; readonly source: SourceKind }
  | { readonly status: "preserved"; readonly source: "generated" } // already on Fly, leave it alone
  | { readonly status: "missing"; readonly dopplerSecret: string };

function resolveSecret(
  target: DeployTarget,
  spec: SecretSpec,
  existingNames: ReadonlySet<string> | null,
  forceRegenerate: ReadonlySet<string>,
): SecretResolution {
  const ctx = { id: target.id, hostname: target.hostname, port: target.port };

  switch (spec.source.t) {
    case "doppler": {
      const value = process.env[spec.name]?.trim();
      if (value) return { status: "set", value, source: "doppler" };
      return { status: "missing", dopplerSecret: spec.name };
    }
    case "literal":
      return { status: "set", value: spec.source.value, source: "literal" };
    case "computed":
      return { status: "set", value: spec.source.compute(ctx), source: "computed" };
    case "generated": {
      const alreadySet = existingNames?.has(spec.name) ?? false;
      if (alreadySet && !forceRegenerate.has(spec.name)) {
        return { status: "preserved", source: "generated" };
      }
      return { status: "set", value: spec.source.generate(), source: "generated" };
    }
  }
}

type SyncOutcome = {
  readonly applied: number;
  readonly preserved: number;
  readonly missing: readonly string[];
  readonly bySource: Readonly<Record<SourceKind, number>>;
};

function syncTargetSecrets(target: DeployTarget, args: Args): SyncOutcome {
  const missing: string[] = [];
  const pairs: string[] = [];
  const bySource: Record<SourceKind, number> = {
    doppler: 0,
    literal: 0,
    computed: 0,
    generated: 0,
  };
  let preserved = 0;
  const specs = target.deploy.secrets ?? [];

  // Fetch the existing secret list ONCE per target. Cheap; one flyctl call.
  // Skip when there are no `generated` specs in play.
  const hasGenerated = specs.some((s) => s.source.t === "generated");
  const existingNames = hasGenerated ? existingFlySecretNames(target) : null;

  for (const spec of specs) {
    const resolved = resolveSecret(target, spec, existingNames, args.regenerate);
    if (resolved.status === "missing") {
      missing.push(resolved.dopplerSecret);
      continue;
    }
    if (resolved.status === "preserved") {
      preserved += 1;
      continue;
    }
    pairs.push(`${spec.name}=${resolved.value}`);
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
  const allDoppler = allDopplerSecretNames();

  console.log(
    `Fly secrets sync (${args.dryRun ? "DRY-RUN" : "APPLY"}) — ` +
      `targets=${targets.length}, doppler-secrets=${allDoppler.length}` +
      (args.regenerate.size > 0 ? `, regenerate=[${[...args.regenerate].join(",")}]` : ""),
  );

  const totals = { applied: 0, preserved: 0, missing: 0, errors: 0 };
  for (const target of targets) {
    const specs = target.deploy.secrets ?? [];
    if (specs.length === 0) {
      console.log(`  ${target.id.padEnd(40)} (no secrets)`);
      continue;
    }
    try {
      const outcome = syncTargetSecrets(target, args);
      totals.applied += outcome.applied;
      totals.preserved += outcome.preserved;
      totals.missing += outcome.missing.length;
      const parts: string[] = [`${outcome.applied}/${specs.length} secrets staged`];
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
