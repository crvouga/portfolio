/**
 * Destroy Fly apps that are no longer represented in `projects.ts`.
 *
 * Defaults to dry-run. Pass `--apply` to actually destroy. Only apps whose
 * names start with `chrisvouga-` are considered (we never touch unrelated
 * Fly apps in the same org).
 *
 * Safety cap:
 *   `--max-destroys <n>` limits how many orphans this run will destroy. The
 *   deploy pipeline sets a low default (1) so a single bad PR can't wipe out
 *   the whole org. Set `--force` (or pass a higher cap) to bypass.
 *
 * CI integration:
 *   `--json` switches output to one JSON object per line, suitable for
 *   piping into `jq` or summarizing in a workflow step:
 *
 *     {"event":"plan","total":16,"orphans":["chrisvouga-foo","..."]}
 *     {"event":"destroyed","name":"chrisvouga-foo"}
 *     {"event":"summary","destroyed":1,"skipped":2,"errors":0}
 *
 * Usage:
 *   bun run scripts/fly/teardown-apps.ts                           # plan
 *   bun run scripts/fly/teardown-apps.ts --apply                   # destroy
 *   bun run scripts/fly/teardown-apps.ts --apply --max-destroys 1  # cap
 *   bun run scripts/fly/teardown-apps.ts --apply --force           # ignore cap
 *   bun run scripts/fly/teardown-apps.ts --org my-org              # override org
 *   bun run scripts/fly/teardown-apps.ts --json                    # CI output
 */
import { ensureFlyAuth, flyctlJson, flyctlSafe, FlyctlError } from "../lib/flyctl.js";
import { buildDeployTargets } from "../lib/project-targets.js";

const REPO_PREFIX = "chrisvouga-";

type Args = {
  readonly apply: boolean;
  readonly org?: string;
  readonly maxDestroys: number;
  readonly force: boolean;
  readonly json: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  let apply = false;
  let org: string | undefined = process.env["FLY_ORG"]?.trim() || undefined;
  let maxDestroys = Number.POSITIVE_INFINITY;
  let force = false;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--org") org = argv[++i];
    else if (arg === "--max-destroys") {
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
          "[--apply] [--org <slug>] [--max-destroys <n>] [--force] [--json]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  const base = { apply, maxDestroys, force, json };
  return org !== undefined ? { ...base, org } : base;
}

type FlyAppListEntry = {
  readonly Name?: string;
  readonly name?: string;
  readonly Organization?: { Slug?: string };
  readonly organization?: { slug?: string };
};

type LogEvent =
  | { readonly event: "plan"; readonly total: number; readonly orphans: readonly string[] }
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
        `Teardown Fly apps (${args.apply ? "APPLY" : "DRY-RUN"}) — total=${ev.total}, ` +
          `prefix='${REPO_PREFIX}', orphans=${ev.orphans.length}, ` +
          `cap=${args.force ? "force" : args.maxDestroys}`,
      );
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

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureFlyAuth();

  const orgArgs = args.org ? ["--org", args.org] : [];
  const apps = flyctlJson<readonly FlyAppListEntry[]>(["apps", "list", ...orgArgs]);

  const known = new Set(buildDeployTargets().map((t) => t.flyApp));
  const orphans: string[] = [];
  for (const app of apps) {
    const name = app.Name ?? app.name ?? "";
    if (!name.startsWith(REPO_PREFIX)) continue;
    if (known.has(name)) continue;
    orphans.push(name);
  }
  orphans.sort();

  emit(args, { event: "plan", total: apps.length, orphans });

  if (orphans.length === 0) {
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

  for (const name of orphans) {
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
  // Cap blocked remaining orphans — not an idempotent no-op case.
  const capBlocked = skipped > 0;
  if (capBlocked) process.exit(2);
}

main();
