/**
 * Destroy Fly apps for the chrisvouga.dev migration.
 *
 * Modes:
 *   --mode known   (default) — destroy chrisvouga-* apps still listed in projects.ts
 *                            (migrated to the DO droplet; idempotent when already gone)
 *   --mode orphans — destroy chrisvouga-* apps no longer in projects.ts (legacy cleanup)
 *
 * Protected (never destroyed): vault-chrisvouga
 *
 * Usage:
 *   bun run scripts/fly/teardown-apps.ts --apply --mode known --force
 */
import { ensureFlyAuth, flyctlJson, flyctlSafe, FlyctlError } from "../lib/flyctl.js";
import { buildDeployTargets } from "../lib/project-targets.js";

const REPO_PREFIX = "chrisvouga-";
const PROTECTED_APPS = new Set(["vault-chrisvouga"]);

type TeardownMode = "known" | "orphans";

type Args = {
  readonly apply: boolean;
  readonly org?: string;
  readonly maxDestroys: number;
  readonly force: boolean;
  readonly json: boolean;
  readonly mode: TeardownMode;
};

function parseArgs(argv: readonly string[]): Args {
  let apply = false;
  let org: string | undefined = process.env["FLY_ORG"]?.trim() || undefined;
  let maxDestroys = Number.POSITIVE_INFINITY;
  let force = false;
  let json = false;
  let mode: TeardownMode = "known";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--org") org = argv[++i];
    else if (arg === "--mode") {
      const raw = argv[++i] ?? "";
      if (raw !== "known" && raw !== "orphans") {
        console.error(`--mode must be "known" or "orphans", got "${raw}"`);
        process.exit(2);
      }
      mode = raw;
    } else if (arg === "--max-destroys") {
      const raw = argv[++i] ?? "";
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        console.error(`--max-destroys expects a non-negative number, got "${raw}"`);
        process.exit(2);
      }
      maxDestroys = n;
    } else if (arg === "--force") force = true;
    else if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/fly/teardown-apps.ts " +
          "[--apply] [--mode known|orphans] [--org <slug>] [--max-destroys <n>] [--force] [--json]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  const base = { apply, maxDestroys, force, json, mode };
  return org !== undefined ? { ...base, org } : base;
}

type FlyAppListEntry = {
  readonly Name?: string;
  readonly name?: string;
};

type LogEvent =
  | {
      readonly event: "plan";
      readonly total: number;
      readonly mode: TeardownMode;
      readonly targets: readonly string[];
    }
  | { readonly event: "would-destroy"; readonly name: string }
  | { readonly event: "destroyed"; readonly name: string }
  | { readonly event: "skipped"; readonly name: string; readonly reason: string }
  | { readonly event: "error"; readonly name: string; readonly message: string }
  | {
      readonly event: "summary";
      readonly destroyed: number;
      readonly skipped: number;
      readonly errors: number;
      readonly mode: "dry-run" | "apply";
    };

function emit(args: Args, ev: LogEvent): void {
  if (args.json) {
    console.log(JSON.stringify(ev));
    return;
  }
  switch (ev.event) {
    case "plan":
      console.log(
        `Teardown Fly apps (${args.apply ? "APPLY" : "DRY-RUN"}) mode=${ev.mode} — ` +
          `total=${ev.total}, targets=${ev.targets.length}, ` +
          `cap=${args.force ? "force" : args.maxDestroys}`,
      );
      for (const name of ev.targets) console.log(`  target: ${name}`);
      return;
    case "would-destroy":
      console.log(`  would destroy: ${ev.name}`);
      return;
    case "destroyed":
      console.log(`  destroyed: ${ev.name}`);
      return;
    case "skipped":
      console.log(`  skipped (${ev.reason}): ${ev.name}`);
      return;
    case "error":
      console.error(`  error destroying ${ev.name}: ${ev.message}`);
      return;
    case "summary":
      console.log(
        `\nSummary (${ev.mode}): destroyed=${ev.destroyed}, skipped=${ev.skipped}, errors=${ev.errors}`,
      );
      return;
  }
}

function isAppNotFound(result: { readonly stdout: string; readonly stderr: string }): boolean {
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  return combined.includes("not found") || combined.includes("could not find app");
}

function selectTargets(
  apps: readonly FlyAppListEntry[],
  knownFlyApps: ReadonlySet<string>,
  mode: TeardownMode,
): string[] {
  const targets: string[] = [];
  for (const app of apps) {
    const name = app.Name ?? app.name ?? "";
    if (!name.startsWith(REPO_PREFIX)) continue;
    if (PROTECTED_APPS.has(name)) continue;
    const isKnown = knownFlyApps.has(name);
    if (mode === "known" ? isKnown : !isKnown) targets.push(name);
  }
  targets.sort();
  return targets;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureFlyAuth();

  const orgArgs = args.org ? ["--org", args.org] : [];
  const apps = flyctlJson<readonly FlyAppListEntry[]>(["apps", "list", ...orgArgs]);
  const knownFlyApps = new Set(buildDeployTargets().map((t) => t.flyApp));
  const targets = selectTargets(apps, knownFlyApps, args.mode);

  emit(args, { event: "plan", total: apps.length, mode: args.mode, targets });

  if (targets.length === 0) {
    emit(args, {
      event: "summary",
      destroyed: 0,
      skipped: 0,
      errors: 0,
      mode: args.apply ? "apply" : "dry-run",
    });
    return;
  }

  const cap = args.force ? Number.POSITIVE_INFINITY : args.maxDestroys;
  let destroyed = 0;
  let skipped = 0;
  let errors = 0;

  for (const name of targets) {
    if (!args.apply) {
      emit(args, { event: "would-destroy", name });
      continue;
    }
    if (destroyed >= cap) {
      skipped += 1;
      emit(args, {
        event: "skipped",
        name,
        reason: `max-destroys=${args.maxDestroys} reached; pass --force or raise the cap`,
      });
      continue;
    }
    try {
      const result = flyctlSafe(["apps", "destroy", name, "--yes"]);
      if (result.exitCode !== 0) {
        if (isAppNotFound(result)) {
          emit(args, { event: "skipped", name, reason: "already destroyed" });
          continue;
        }
        throw new FlyctlError(["apps", "destroy", name, "--yes"], result);
      }
      destroyed += 1;
      emit(args, { event: "destroyed", name });
    } catch (err) {
      errors += 1;
      emit(args, {
        event: "error",
        name,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  emit(args, {
    event: "summary",
    destroyed,
    skipped,
    errors,
    mode: args.apply ? "apply" : "dry-run",
  });

  if (errors > 0) process.exit(1);
  if (skipped > 0) process.exit(2);
}

main();
