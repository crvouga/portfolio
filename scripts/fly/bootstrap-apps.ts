/**
 * Bootstrap Fly apps for every deploy target.
 *
 * Idempotent: if an app already exists, we skip create. After ensuring the app
 * exists, we allocate dedicated IPv4 + IPv6 addresses (so Fly can serve TLS
 * on the custom hostname) — also a no-op if already allocated.
 *
 * Usage:
 *   bun run scripts/fly/bootstrap-apps.ts                  # all targets
 *   bun run scripts/fly/bootstrap-apps.ts --id pickflix    # one target
 *   bun run scripts/fly/bootstrap-apps.ts --org my-org     # override org
 *   bun run scripts/fly/bootstrap-apps.ts --dry-run        # plan only
 */
import {
  ensureFlyAuth,
  flyAppExists,
  flyctl,
  flyctlSafe,
} from "../lib/flyctl.js";
import { buildDeployTargets, findTargetById, type DeployTarget } from "../lib/project-targets.js";

type Args = {
  readonly ids: readonly string[];
  readonly org: string;
  readonly dryRun: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  let org = process.env["FLY_ORG"]?.trim() || "personal";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--org") org = argv[++i] ?? org;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/fly/bootstrap-apps.ts [--id <id> ...] [--org <slug>] [--dry-run]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { ids: ids.filter(Boolean), org, dryRun };
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

function ensureApp(target: DeployTarget, args: Args): "created" | "exists" {
  if (flyAppExists(target.flyApp)) return "exists";
  if (args.dryRun) return "created";
  flyctl(["apps", "create", target.flyApp, "--org", args.org]);
  return "created";
}

function ensureIp(target: DeployTarget, kind: "v4" | "v6", dryRun: boolean): "allocated" | "exists" | "error" {
  // `fly ips list --json` returns existing addresses; allocate only if none.
  const list = flyctlSafe(["ips", "list", "--json"], { app: target.flyApp });
  if (list.exitCode !== 0) {
    return "error";
  }
  type Ip = { Type?: string; type?: string };
  let parsed: readonly Ip[] = [];
  try {
    parsed = JSON.parse(list.stdout || "[]") as readonly Ip[];
  } catch {
    parsed = [];
  }
  const wantedTypes = kind === "v4" ? ["v4", "shared_v4"] : ["v6"];
  const has = parsed.some((entry) => {
    const t = (entry.Type ?? entry.type ?? "").toLowerCase();
    return wantedTypes.includes(t);
  });
  if (has) return "exists";
  if (dryRun) return "allocated";

  const allocateArgs =
    kind === "v4"
      ? ["ips", "allocate-v4", "--shared", "--yes"]
      : ["ips", "allocate-v6"];
  const r = flyctlSafe(allocateArgs, { app: target.flyApp });
  if (r.exitCode !== 0) return "error";
  return "allocated";
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  ensureFlyAuth();
  const targets = targetsFromArgs(args);

  console.log(
    `Bootstrap Fly apps (${args.dryRun ? "DRY-RUN" : "APPLY"}) — org=${args.org}, targets=${targets.length}`,
  );

  const summary = { created: 0, exists: 0, errors: 0 };
  for (const target of targets) {
    try {
      const appStatus = ensureApp(target, args);
      const v4 = ensureIp(target, "v4", args.dryRun);
      const v6 = ensureIp(target, "v6", args.dryRun);
      console.log(
        `  ${target.id.padEnd(40)} app=${appStatus} v4=${v4} v6=${v6} (${target.flyHostname})`,
      );
      if (appStatus === "created") summary.created += 1;
      else summary.exists += 1;
      if (v4 === "error" || v6 === "error") summary.errors += 1;
    } catch (err) {
      summary.errors += 1;
      console.error(`  ${target.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `\nSummary: created=${summary.created}, existing=${summary.exists}, errors=${summary.errors}`,
  );
  if (summary.errors > 0) process.exit(1);
}

main();
