/**
 * Tiny adapter on top of `projects.ts` that bundles the derived names every
 * orchestrator script needs (Fly app, Cloudflare zone, expected fly.dev CNAME
 * target). Keeps the rest of the scripts free of string fiddling.
 *
 * All project-specific knowledge (secrets, build paths) now lives ON THE
 * PROJECT inside `projects.ts`. This file is intentionally thin.
 */
import {
  allVaultSecretNames,
  cloudflareZoneForHostname,
  flyAppName,
  getInfraTargets,
  type DeploySpec,
  type InfraTarget,
} from "../../projects.js";

export type DeployTarget = InfraTarget & {
  /** Fly app name, e.g. `chrisvouga-pickflix`. */
  readonly flyApp: string;
  /** Default Fly hostname, e.g. `chrisvouga-pickflix.fly.dev`. CNAME target. */
  readonly flyHostname: string;
  /** Cloudflare zone (apex), e.g. `chrisvouga.dev`. */
  readonly zone: string;
  /** DNS record name relative to the zone, e.g. `pickflix` or `svelte.headlesscombobox`. */
  readonly recordName: string;
  /**
   * Convenience accessors for the most-used `deploy` fields. Backed by the
   * embedded `deploy` object — DO NOT diverge.
   */
  readonly hostname: string;
  readonly port: number;
  readonly githubRepo: string;
};

export function buildDeployTargets(): readonly DeployTarget[] {
  return getInfraTargets().map(toDeployTarget);
}

export function toDeployTarget(target: InfraTarget): DeployTarget {
  const flyApp = flyAppName(target.id);
  const flyHostname = `${flyApp}.fly.dev`;
  const zone = cloudflareZoneForHostname(target.deploy.hostname);
  const recordName =
    target.deploy.hostname === zone ? "@" : target.deploy.hostname.replace(`.${zone}`, "");
  return {
    ...target,
    flyApp,
    flyHostname,
    zone,
    recordName,
    hostname: target.deploy.hostname,
    port: target.deploy.port,
    githubRepo: target.deploy.githubRepo,
  };
}

export function findTargetById(id: string): DeployTarget | undefined {
  return buildDeployTargets().find((t) => t.id === id);
}

/** Unique list of zones referenced by any deploy target. */
export function uniqueZones(): readonly string[] {
  const set = new Set<string>();
  for (const t of buildDeployTargets()) set.add(t.zone);
  return [...set].sort();
}

/**
 * Re-export so workflow validation scripts can read the registry without
 * needing a relative path back to the root.
 */
export { allVaultSecretNames };

/** Re-export the canonical deploy spec for scripts that consume it directly. */
export type { DeploySpec, InfraTarget };
