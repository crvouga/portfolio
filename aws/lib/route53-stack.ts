import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";
import { getInfraTargets } from "../../projects.js";

export type Route53StackProps = cdk.StackProps;

/**
 * Route53 hosted zones for every domain referenced by deployable projects.
 *
 * The cutover plan is:
 *   1) Deploy this stack first.
 *   2) Read the `Nameservers-<apex>` outputs.
 *   3) Update the domain registrar's NS records to those values.
 *   4) Wait for delegation propagation, then deploy the Lambda services stack
 *      (which creates ACM certs validated against these zones).
 */
export class Route53Stack extends cdk.Stack {
  public readonly hostedZones: Readonly<Record<string, route53.IHostedZone>>;

  constructor(scope: Construct, id: string, props?: Route53StackProps) {
    super(scope, id, props);

    const apexDomains = collectApexDomains();
    const zones: Record<string, route53.IHostedZone> = {};

    for (const apex of apexDomains) {
      const safe = safeCfnId(apex);
      const zone = new route53.PublicHostedZone(this, `Zone-${safe}`, {
        zoneName: apex,
        comment: `Authoritative DNS for ${apex} (managed by AWS CDK)`,
      });
      zones[apex] = zone;

      new cdk.CfnOutput(this, `HostedZoneId-${safe}`, {
        value: zone.hostedZoneId,
        description: `Route53 hosted zone id for ${apex}`,
        exportName: `chrisvouga-zone-id-${safe}`,
      });

      new cdk.CfnOutput(this, `Nameservers-${safe}`, {
        value: cdk.Fn.join(",", zone.hostedZoneNameServers ?? []),
        description: `Nameservers for ${apex} (set these as registrar NS records)`,
      });
    }

    this.hostedZones = zones;
  }
}

/** Unique apex domains across every infra target. */
function collectApexDomains(): readonly string[] {
  const apexes = new Set<string>();
  for (const target of getInfraTargets()) {
    apexes.add(apexDomain(target.hostname));
  }
  return [...apexes].sort();
}

export function apexDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length < 2) return hostname;
  return parts.slice(-2).join(".");
}

function safeCfnId(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "");
}
