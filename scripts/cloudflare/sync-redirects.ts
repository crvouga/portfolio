/**
 * Ensure the portfolio apex hostname redirects to www via Cloudflare.
 *
 *   1. Proxied placeholder A record on the zone apex (traffic hits Cloudflare).
 *   2. Zone redirect rule: chrisvouga.dev → www.chrisvouga.dev (301, path + query).
 *
 * Subdomains stay DNS-only CNAMEs to Fly (managed by sync-dns.ts).
 *
 * Usage:
 *   bun run scripts/cloudflare/sync-redirects.ts
 *   bun run scripts/cloudflare/sync-redirects.ts --apply
 */
import {
  CloudflareApi,
  type CloudflareDnsRecord,
  type CloudflareRulesetRule,
} from "../lib/cloudflare-api.js";
import {
  PORTFOLIO_INFRA_TARGET,
  cloudflareZoneForHostname,
  portfolioApexHostname,
} from "../../projects.js";

const REDIRECT_PHASE = "http_request_dynamic_redirect";
const RULE_REF = "chrisvouga_apex_to_www";
const MANAGED_COMMENT = "managed by scripts/cloudflare/sync-redirects.ts";
/** Placeholder origin; redirect fires at Cloudflare edge before origin is contacted. */
const APEX_PLACEHOLDER_IPV4 = "192.0.2.1";

type Args = { readonly apply: boolean };

function parseArgs(argv: readonly string[]): Args {
  let apply = false;
  for (const arg of argv) {
    if (arg === "--apply") apply = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: bun run scripts/cloudflare/sync-redirects.ts [--apply]");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return { apply };
}

function apexRedirectRule(fromHost: string, toHost: string): CloudflareRulesetRule {
  return {
    ref: RULE_REF,
    expression: `(http.host eq "${fromHost}")`,
    description: `${MANAGED_COMMENT} — ${fromHost} → ${toHost}`,
    enabled: true,
    action: "redirect",
    action_parameters: {
      from_value: {
        status_code: 301,
        preserve_query_string: true,
        target_url: {
          expression: `concat("https://${toHost}", http.request.uri.path)`,
        },
      },
    },
  };
}

function isManagedRule(rule: CloudflareRulesetRule): boolean {
  return rule.ref === RULE_REF || (rule.description?.includes(MANAGED_COMMENT) ?? false);
}

function rulePayload(rule: CloudflareRulesetRule): CloudflareRulesetRule {
  const out: CloudflareRulesetRule = {
    expression: rule.expression,
    action: rule.action,
    enabled: rule.enabled ?? true,
    ...(rule.action_parameters !== undefined
      ? { action_parameters: rule.action_parameters }
      : {}),
    ...(rule.description !== undefined ? { description: rule.description } : {}),
    ...(rule.ref !== undefined ? { ref: rule.ref } : {}),
    ...(rule.id !== undefined ? { id: rule.id } : {}),
  };
  return out;
}

function rulesMatch(a: CloudflareRulesetRule, b: CloudflareRulesetRule): boolean {
  return (
    a.expression === b.expression &&
    a.action === b.action &&
    JSON.stringify(a.action_parameters) === JSON.stringify(b.action_parameters) &&
    (a.enabled ?? true) === (b.enabled ?? true)
  );
}

function mergeRedirectRules(
  existing: readonly CloudflareRulesetRule[],
  desired: CloudflareRulesetRule,
): readonly CloudflareRulesetRule[] {
  const rest = existing.filter((r) => !isManagedRule(r)).map(rulePayload);
  return [desired, ...rest];
}

type DnsDeleteAction = {
  readonly kind: "delete";
  readonly recordId: string;
  readonly hostname: string;
  readonly reason: string;
};

type DnsUpsertAction =
  | { readonly kind: "create" }
  | { readonly kind: "update"; readonly recordId: string; readonly reason: string }
  | { readonly kind: "ok" };

function planApexDns(
  zoneName: string,
  records: readonly CloudflareDnsRecord[],
): { readonly deletes: readonly DnsDeleteAction[]; readonly upsert: DnsUpsertAction } {
  const apexRecords = records.filter((r) => r.name === zoneName);
  const desired = {
    type: "A" as const,
    content: APEX_PLACEHOLDER_IPV4,
    proxied: true,
  };

  const matchingA = apexRecords.filter(
    (r) =>
      r.type === "A" &&
      r.content === desired.content &&
      r.proxied === desired.proxied,
  );
  const deletes: DnsDeleteAction[] = [];
  for (const r of apexRecords) {
    if (matchingA.some((m) => m.id === r.id)) continue;
    deletes.push({
      kind: "delete",
      recordId: r.id,
      hostname: r.name,
      reason: `${r.type} ${r.content} proxied=${r.proxied}`,
    });
  }

  if (matchingA.length > 0) {
    return { deletes, upsert: { kind: "ok" } };
  }
  if (apexRecords.length === deletes.length) {
    return { deletes, upsert: { kind: "create" } };
  }
  const leftover = apexRecords.find((r) => !deletes.some((d) => d.recordId === r.id));
  if (leftover?.type === "A") {
    const drifts: string[] = [];
    if (leftover.content !== desired.content) {
      drifts.push(`content ${leftover.content} → ${desired.content}`);
    }
    if (leftover.proxied !== desired.proxied) {
      drifts.push(`proxied ${leftover.proxied} → ${desired.proxied}`);
    }
    return {
      deletes,
      upsert: { kind: "update", recordId: leftover.id, reason: drifts.join(", ") },
    };
  }
  return { deletes, upsert: { kind: "create" } };
}

async function applyApexDns(
  cf: CloudflareApi,
  zoneId: string,
  zoneName: string,
  plan: { readonly deletes: readonly DnsDeleteAction[]; readonly upsert: DnsUpsertAction },
): Promise<void> {
  const input = {
    name: zoneName,
    type: "A" as const,
    content: APEX_PLACEHOLDER_IPV4,
    proxied: true,
    ttl: 1,
    comment: MANAGED_COMMENT,
  };
  for (const del of plan.deletes) {
    await cf.deleteDnsRecord(zoneId, del.recordId);
  }
  switch (plan.upsert.kind) {
    case "create":
      await cf.createDnsRecord(zoneId, input);
      return;
    case "update":
      await cf.updateDnsRecord(zoneId, plan.upsert.recordId, input);
      return;
    case "ok":
      return;
  }
}

type RulesAction =
  | { readonly kind: "create" }
  | { readonly kind: "update"; readonly rulesetId: string }
  | { readonly kind: "ok" };

function planRules(
  entrypoint: { readonly id: string; readonly rules: readonly CloudflareRulesetRule[] } | null,
  desired: CloudflareRulesetRule,
): RulesAction {
  if (!entrypoint) return { kind: "create" };
  const current = entrypoint.rules.find(isManagedRule);
  if (current && rulesMatch(current, desired)) return { kind: "ok" };
  return { kind: "update", rulesetId: entrypoint.id };
}

async function applyRules(
  cf: CloudflareApi,
  zoneId: string,
  entrypoint: { readonly id: string; readonly name: string; readonly rules: readonly CloudflareRulesetRule[] } | null,
  desired: CloudflareRulesetRule,
  action: RulesAction,
): Promise<void> {
  const merged = mergeRedirectRules(entrypoint?.rules ?? [], desired);
  const body = {
    name: entrypoint?.name ?? "Redirect rules ruleset",
    kind: "zone" as const,
    phase: REDIRECT_PHASE,
    rules: merged,
  };
  if (action.kind === "create") {
    await cf.createRuleset(zoneId, body);
    return;
  }
  if (action.kind === "update") {
    await cf.updateRuleset(zoneId, action.rulesetId, body);
    return;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cf = new CloudflareApi();
  const fromHost = portfolioApexHostname();
  const toHost = PORTFOLIO_INFRA_TARGET.deploy.hostname;
  const zoneName = cloudflareZoneForHostname(toHost);
  const desiredRule = apexRedirectRule(fromHost, toHost);

  console.log(
    `Sync Cloudflare redirects (${args.apply ? "APPLY" : "DRY-RUN"}) — ${fromHost} → https://${toHost}`,
  );

  const zone = await cf.findZoneByName(zoneName);
  if (!zone) {
    console.error(`  zone "${zoneName}" not found; run setup-zone.ts first.`);
    process.exit(1);
  }

  let errors = 0;

  const records = await cf.listDnsRecords(zone.id);
  const dnsPlan = planApexDns(zoneName, records);
  const dnsLines: string[] = [];
  for (const del of dnsPlan.deletes) {
    dnsLines.push(`DELETE ${del.hostname} (${del.reason})`);
  }
  if (dnsPlan.upsert.kind === "ok") {
    dnsLines.push(`OK     apex ${zoneName} A ${APEX_PLACEHOLDER_IPV4} proxied`);
  } else if (dnsPlan.upsert.kind === "create") {
    dnsLines.push(`CREATE apex ${zoneName} A ${APEX_PLACEHOLDER_IPV4} proxied=true`);
  } else {
    dnsLines.push(`UPDATE apex ${zoneName}: ${dnsPlan.upsert.reason}`);
  }
  const dnsChanged =
    dnsPlan.deletes.length > 0 || dnsPlan.upsert.kind !== "ok";
  console.log(`\n[apex DNS]`);
  if (!dnsChanged) {
    console.log(`  ${dnsLines[0]}`);
  } else if (!args.apply) {
    for (const line of dnsLines) console.log(`  [plan] ${line}`);
  } else {
    try {
      await applyApexDns(cf, zone.id, zoneName, dnsPlan);
      for (const line of dnsLines) console.log(`  [done] ${line}`);
    } catch (err) {
      errors += 1;
      console.error(
        `  [fail] apex DNS — ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  const entrypoint = await cf.getRulesetPhaseEntrypoint(zone.id, REDIRECT_PHASE);
  const rulesAction = planRules(entrypoint, desiredRule);
  const rulesLine =
    rulesAction.kind === "ok"
      ? `OK     redirect rule ${fromHost} → ${toHost}`
      : rulesAction.kind === "create"
        ? `CREATE redirect rule ${fromHost} → ${toHost}`
        : `UPDATE redirect rule ${fromHost} → ${toHost}`;
  console.log(`\n[redirect rule]`);
  if (rulesAction.kind === "ok") {
    console.log(`  ${rulesLine}`);
  } else if (!args.apply) {
    console.log(`  [plan] ${rulesLine}`);
  } else {
    try {
      await applyRules(cf, zone.id, entrypoint, desiredRule, rulesAction);
      console.log(`  [done] ${rulesLine}`);
    } catch (err) {
      errors += 1;
      console.error(`  [fail] ${rulesLine} — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nSummary: errors=${errors}, mode=${args.apply ? "apply" : "plan"}`);
  if (errors > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
