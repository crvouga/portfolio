/**
 * Destroy Fly apps that are no longer represented in `projects.ts`.
 *
 * Defaults to dry-run. Pass `--apply` to actually destroy. Only apps whose
 * names start with `chrisvouga-` are considered (we never touch unrelated
 * Fly apps in the same org).
 *
 * Usage:
 *   bun run scripts/fly/teardown-apps.ts                # plan
 *   bun run scripts/fly/teardown-apps.ts --apply        # destroy
 *   bun run scripts/fly/teardown-apps.ts --org my-org   # override org
 */
import { ensureFlyAuth, flyctl, flyctlJson } from "../lib/flyctl.js";
import { buildDeployTargets } from "../lib/project-targets.js";

const REPO_PREFIX = "chrisvouga-";

type Args = { readonly apply: boolean; readonly org?: string };

function parseArgs(argv: readonly string[]): Args {
  let apply = false;
  let org: string | undefined = process.env["FLY_ORG"]?.trim() || undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--org") org = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/fly/teardown-apps.ts [--apply] [--org <slug>]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return org !== undefined ? { apply, org } : { apply };
}

type FlyAppListEntry = {
  readonly Name?: string;
  readonly name?: string;
  readonly Organization?: { Slug?: string };
  readonly organization?: { slug?: string };
};

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

  console.log(
    `Teardown Fly apps (${args.apply ? "APPLY" : "DRY-RUN"}) — total=${apps.length}, ` +
      `prefix='${REPO_PREFIX}', orphans=${orphans.length}`,
  );
  for (const name of orphans) {
    if (!args.apply) {
      console.log(`  would destroy: ${name}`);
      continue;
    }
    flyctl(["apps", "destroy", name, "--yes"]);
    console.log(`  destroyed: ${name}`);
  }
}

main();
