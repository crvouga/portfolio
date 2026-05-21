/**
 * Ensure the Cloudflare zone(s) referenced by `projects.ts` exist, then print
 * the assigned nameservers so the registrar can be updated.
 *
 * Idempotent: an existing zone is not modified.
 *
 * Usage:
 *   bun run scripts/cloudflare/setup-zone.ts                # ensure all zones
 *   bun run scripts/cloudflare/setup-zone.ts --zone foo.dev # specific zone
 *   bun run scripts/cloudflare/setup-zone.ts --dry-run      # plan only
 */
import { CloudflareApi, getCloudflareAccountId } from "../lib/cloudflare-api.js";
import { uniqueZones } from "../lib/project-targets.js";

type Args = {
  readonly zones: readonly string[];
  readonly dryRun: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  const zones: string[] = [];
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--zone") zones.push(argv[++i] ?? "");
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/cloudflare/setup-zone.ts [--zone <name>] [--dry-run]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  const resolved = zones.filter(Boolean);
  return { zones: resolved.length > 0 ? resolved : uniqueZones(), dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const accountId = getCloudflareAccountId();
  const cf = new CloudflareApi();

  console.log(
    `Setup Cloudflare zones (${args.dryRun ? "DRY-RUN" : "APPLY"}) — accountId=${accountId}, zones=${args.zones.join(", ")}`,
  );
  for (const name of args.zones) {
    const existing = await cf.findZoneByName(name);
    let zone = existing;
    if (!zone) {
      if (args.dryRun) {
        console.log(`  ${name}: would create`);
        continue;
      }
      zone = await cf.createZone(name, accountId);
      console.log(`  ${name}: created (id=${zone.id})`);
    } else {
      console.log(`  ${name}: exists (id=${existing!.id}, status=${existing!.status})`);
    }
    const fresh = await cf.getZone(zone.id);
    const ns = fresh.name_servers ?? [];
    if (ns.length > 0) {
      console.log(`    nameservers: ${ns.join(", ")}`);
      console.log(`    registrar action: point ${name} NS to the values above.`);
    } else {
      console.log("    (nameservers not yet assigned; rerun in a few seconds)");
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
