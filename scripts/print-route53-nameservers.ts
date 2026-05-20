/**
 * Read CloudFormation outputs from the deployed Route53Stack and print the
 * authoritative nameservers per hosted zone.
 *
 * Used by the registrar cutover workflow: copy these values into your domain
 * registrar's NS records, then wait for delegation propagation before running
 * the deployment pipeline.
 *
 * Env: AWS_REGION (default: us-east-1) and standard AWS creds (OIDC in CI,
 * or `aws configure` locally).
 *
 * Usage:
 *   bun run scripts/print-route53-nameservers.ts
 *   bun run scripts/print-route53-nameservers.ts --stack Route53Stack
 *   bun run scripts/print-route53-nameservers.ts --markdown   # GitHub-friendly output
 */
import { spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";

type Args = {
  readonly stackName: string;
  readonly region: string;
  readonly markdown: boolean;
};

function parseArgs(argv: readonly string[]): Args {
  let stackName = "Route53Stack";
  let region = process.env["AWS_REGION"]?.trim() || "us-east-1";
  let markdown = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--stack") {
      stackName = argv[++i] ?? stackName;
    } else if (arg === "--region") {
      region = argv[++i] ?? region;
    } else if (arg === "--markdown") {
      markdown = true;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: bun run scripts/print-route53-nameservers.ts [--stack Route53Stack] [--region us-east-1] [--markdown]",
      );
      process.exit(0);
    }
  }
  return { stackName, region, markdown };
}

type StackOutput = { readonly OutputKey: string; readonly OutputValue: string; readonly Description?: string };

function describeStackOutputs(stackName: string, region: string): readonly StackOutput[] {
  const result = spawnSync(
    "aws",
    [
      "cloudformation",
      "describe-stacks",
      "--stack-name",
      stackName,
      "--region",
      region,
      "--query",
      "Stacks[0].Outputs",
      "--output",
      "json",
    ],
    { encoding: "utf-8" },
  );
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || "aws cloudformation describe-stacks failed");
    process.exit(1);
  }
  try {
    return JSON.parse(result.stdout) as readonly StackOutput[];
  } catch (err) {
    console.error(`Failed to parse describe-stacks output: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

const ARGS = parseArgs(process.argv.slice(2));
const outputs = describeStackOutputs(ARGS.stackName, ARGS.region);

type Zone = {
  readonly apex: string;
  readonly hostedZoneId: string | undefined;
  readonly nameservers: readonly string[];
};

const zones = new Map<string, { hostedZoneId?: string; nameservers?: readonly string[] }>();

for (const output of outputs) {
  const idMatch = output.OutputKey.match(/^HostedZoneId(.+)$/);
  if (idMatch) {
    const apexKey = idMatch[1]!;
    const existing = zones.get(apexKey) ?? {};
    zones.set(apexKey, { ...existing, hostedZoneId: output.OutputValue });
    continue;
  }
  const nsMatch = output.OutputKey.match(/^Nameservers(.+)$/);
  if (nsMatch) {
    const apexKey = nsMatch[1]!;
    const existing = zones.get(apexKey) ?? {};
    zones.set(apexKey, { ...existing, nameservers: output.OutputValue.split(",").map((s) => s.trim()) });
  }
}

const safeApexToHuman = new Map<string, string>();
// HostedZoneId outputs are exported with name `chrisvouga-zone-id-<safeapex>` and
// the nameserver output description includes the apex domain. We use the description.
for (const output of outputs) {
  const nsMatch = output.OutputKey.match(/^Nameservers(.+)$/);
  if (!nsMatch) continue;
  const apexKey = nsMatch[1]!;
  const description = output.Description ?? "";
  const apexFromDescription = description.match(/Nameservers for ([\w.-]+)/i)?.[1];
  if (apexFromDescription) {
    safeApexToHuman.set(apexKey, apexFromDescription);
  } else {
    safeApexToHuman.set(apexKey, apexKey);
  }
}

const sortedZones: Zone[] = [...zones.entries()]
  .map(([apexKey, value]) => ({
    apex: safeApexToHuman.get(apexKey) ?? apexKey,
    hostedZoneId: value.hostedZoneId,
    nameservers: value.nameservers ?? [],
  }))
  .sort((a, b) => a.apex.localeCompare(b.apex));

if (sortedZones.length === 0) {
  console.error(`No hosted zones found in stack ${ARGS.stackName}`);
  process.exit(1);
}

if (ARGS.markdown) {
  const lines: string[] = [];
  lines.push("## Route53 nameservers");
  lines.push("");
  lines.push(
    "Update the following NS records in your domain registrar (Squarespace / Google Domains / etc).",
  );
  lines.push("After NS delegation propagates, the deployment pipeline will produce healthy responses.");
  lines.push("");
  for (const zone of sortedZones) {
    lines.push(`### ${zone.apex}`);
    if (zone.hostedZoneId) lines.push(`- Hosted zone id: \`${zone.hostedZoneId}\``);
    lines.push("- Nameservers:");
    for (const ns of zone.nameservers) {
      lines.push(`  - \`${ns}\``);
    }
    lines.push("");
  }
  const out = lines.join("\n");
  console.log(out);
  const summary = process.env["GITHUB_STEP_SUMMARY"];
  if (summary) appendFileSync(summary, `${out}\n`);
} else {
  for (const zone of sortedZones) {
    console.log(`Zone: ${zone.apex}`);
    if (zone.hostedZoneId) console.log(`  HostedZoneId: ${zone.hostedZoneId}`);
    for (const ns of zone.nameservers) {
      console.log(`  NS: ${ns}`);
    }
    console.log();
  }
}
