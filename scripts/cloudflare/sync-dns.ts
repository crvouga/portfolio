/**
 * Reconcile Cloudflare DNS records against `projects.ts`.
 *
 * For every infra target we ensure exactly one CNAME record:
 *   <recordName>.<zone>  CNAME  <flyApp>.fly.dev   (proxied=false, ttl=auto)
 *
 * Drift handled:
 *   - missing record         → create
 *   - wrong type/content     → update
 *   - duplicate fly.dev CNAMEs in the same zone that no longer match a target
 *     and whose record name starts with the repo prefix → delete
 *
 * Defaults to dry-run; pass `--apply` to mutate.
 *
 * Usage:
 *   bun run scripts/cloudflare/sync-dns.ts             # plan
 *   bun run scripts/cloudflare/sync-dns.ts --apply     # apply
 *   bun run scripts/cloudflare/sync-dns.ts --id pickflix --apply
 *   bun run scripts/cloudflare/sync-dns.ts --proxied   # also flip proxied=true
 */
import {
  CloudflareApi,
  type CloudflareDnsRecord,
} from "../lib/cloudflare-api.js";
import {
  buildDeployTargets,
  findTargetById,
  type DeployTarget,
} from "../lib/project-targets.js";

type Args = {
  readonly ids: readonly string[];
  readonly apply: boolean;
  readonly proxied: boolean;
  readonly pruneOrphans: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const ids: string[] = [];
  let apply = false;
  let proxied = false;
  let pruneOrphans = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--id") ids.push(argv[++i] ?? "");
    else if (arg === "--apply") apply = true;
    else if (arg === "--proxied") proxied = true;
    else if (arg === "--no-prune") pruneOrphans = false;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/cloudflare/sync-dns.ts [--id <id> ...] [--apply] [--proxied] [--no-prune]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { ids: ids.filter(Boolean), apply, proxied, pruneOrphans };
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

type Action =
  | { readonly kind: "create"; readonly target: DeployTarget }
  | { readonly kind: "update"; readonly target: DeployTarget; readonly recordId: string; readonly reason: string }
  | { readonly kind: "delete"; readonly hostname: string; readonly recordId: string; readonly reason: string }
  | { readonly kind: "ok"; readonly target: DeployTarget };

const REPO_PREFIX = "chrisvouga-";
const FLY_HOST_SUFFIX = ".fly.dev";

async function planForZone(
  cf: CloudflareApi,
  zone: string,
  zoneId: string,
  targets: readonly DeployTarget[],
  args: Args,
): Promise<readonly Action[]> {
  const records = await cf.listDnsRecords(zoneId);
  const recordsByHost = new Map<string, CloudflareDnsRecord[]>();
  for (const r of records) {
    const list = recordsByHost.get(r.name) ?? [];
    list.push(r);
    recordsByHost.set(r.name, list);
  }

  const desired = targets.filter((t) => t.zone === zone);
  const desiredHostnames = new Set(desired.map((t) => t.hostname));
  const actions: Action[] = [];

  for (const target of desired) {
    const existing = recordsByHost.get(target.hostname) ?? [];
    const cnames = existing.filter((r) => r.type === "CNAME");
    const others = existing.filter((r) => r.type !== "CNAME");
    if (existing.length === 0) {
      actions.push({ kind: "create", target });
      continue;
    }
    for (const o of others) {
      actions.push({
        kind: "delete",
        hostname: o.name,
        recordId: o.id,
        reason: `non-CNAME ${o.type} record collides with managed CNAME`,
      });
    }
    if (cnames.length === 0) {
      actions.push({ kind: "create", target });
      continue;
    }
    const [primary, ...extra] = cnames;
    for (const e of extra) {
      actions.push({
        kind: "delete",
        hostname: e.name,
        recordId: e.id,
        reason: "duplicate CNAME",
      });
    }
    const drifts: string[] = [];
    if (primary!.content !== target.flyHostname) {
      drifts.push(`content ${primary!.content} → ${target.flyHostname}`);
    }
    if (primary!.proxied !== args.proxied) {
      drifts.push(`proxied ${primary!.proxied} → ${args.proxied}`);
    }
    if (drifts.length > 0) {
      actions.push({
        kind: "update",
        target,
        recordId: primary!.id,
        reason: drifts.join(", "),
      });
    } else {
      actions.push({ kind: "ok", target });
    }
  }

  if (args.pruneOrphans) {
    for (const r of records) {
      if (r.type !== "CNAME") continue;
      if (!r.content.endsWith(FLY_HOST_SUFFIX)) continue;
      if (desiredHostnames.has(r.name)) continue;
      const flyApp = r.content.slice(0, -FLY_HOST_SUFFIX.length);
      if (!flyApp.startsWith(REPO_PREFIX)) continue;
      actions.push({
        kind: "delete",
        hostname: r.name,
        recordId: r.id,
        reason: `orphan CNAME pointing at ${r.content}`,
      });
    }
  }

  return actions;
}

async function applyAction(cf: CloudflareApi, zoneId: string, action: Action, args: Args): Promise<void> {
  switch (action.kind) {
    case "create":
      await cf.createDnsRecord(zoneId, {
        name: action.target.hostname,
        type: "CNAME",
        content: action.target.flyHostname,
        proxied: args.proxied,
        ttl: 1,
        comment: "managed by scripts/cloudflare/sync-dns.ts",
      });
      return;
    case "update":
      await cf.updateDnsRecord(zoneId, action.recordId, {
        name: action.target.hostname,
        type: "CNAME",
        content: action.target.flyHostname,
        proxied: args.proxied,
        ttl: 1,
        comment: "managed by scripts/cloudflare/sync-dns.ts",
      });
      return;
    case "delete":
      await cf.deleteDnsRecord(zoneId, action.recordId);
      return;
    case "ok":
      return;
  }
}

function summariseAction(action: Action): string {
  switch (action.kind) {
    case "create":
      return `CREATE ${action.target.hostname} CNAME → ${action.target.flyHostname}`;
    case "update":
      return `UPDATE ${action.target.hostname}: ${action.reason}`;
    case "delete":
      return `DELETE ${action.hostname} (${action.reason})`;
    case "ok":
      return `OK     ${action.target.hostname}`;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cf = new CloudflareApi();
  const targets = targetsFromArgs(args);
  const zones = [...new Set(targets.map((t) => t.zone))].sort();

  console.log(
    `Sync Cloudflare DNS (${args.apply ? "APPLY" : "DRY-RUN"}) — zones=${zones.join(", ")}, targets=${targets.length}, proxied=${args.proxied}`,
  );

  let totalChanges = 0;
  let totalErrors = 0;
  for (const zoneName of zones) {
    const zone = await cf.findZoneByName(zoneName);
    if (!zone) {
      console.error(`  zone "${zoneName}" not found in Cloudflare account; run setup-zone.ts first.`);
      totalErrors += 1;
      continue;
    }
    const actions = await planForZone(cf, zoneName, zone.id, targets, args);
    console.log(`\n[zone ${zoneName} (id=${zone.id})]`);
    for (const action of actions) {
      const line = summariseAction(action);
      if (action.kind === "ok") {
        console.log(`  ${line}`);
        continue;
      }
      totalChanges += 1;
      if (!args.apply) {
        console.log(`  [plan] ${line}`);
        continue;
      }
      try {
        await applyAction(cf, zone.id, action, args);
        console.log(`  [done] ${line}`);
      } catch (err) {
        totalErrors += 1;
        console.error(`  [fail] ${line} — ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  console.log(`\nSummary: changes=${totalChanges}, errors=${totalErrors}, mode=${args.apply ? "apply" : "plan"}`);
  if (totalErrors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
