/**
 * Tiny adapter on top of `projects.ts` that bundles the derived names every
 * orchestrator script needs (Fly app, Cloudflare zone, expected fly.dev CNAME
 * target). Keeps the rest of the scripts free of string fiddling.
 */
import {
  cloudflareZoneForHostname,
  flyAppName,
  getInfraTargets,
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
};

export function buildDeployTargets(): readonly DeployTarget[] {
  return getInfraTargets().map(toDeployTarget);
}

export function toDeployTarget(target: InfraTarget): DeployTarget {
  const flyApp = flyAppName(target.id);
  const flyHostname = `${flyApp}.fly.dev`;
  const zone = cloudflareZoneForHostname(target.hostname);
  const recordName = target.hostname === zone ? "@" : target.hostname.replace(`.${zone}`, "");
  return {
    ...target,
    flyApp,
    flyHostname,
    zone,
    recordName,
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
 * GitHub repo secrets piped into Fly via `fly secrets set`. The set is
 * intentionally narrow: every name here must exist as a GitHub Actions secret.
 */
export const GITHUB_REPO_APP_SECRETS = [
  "TMDB_API_READ_ACCESS_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SERVICE_SID",
] as const;

export type GithubRepoAppSecret = (typeof GITHUB_REPO_APP_SECRETS)[number];

export function isGithubRepoAppSecret(name: string): name is GithubRepoAppSecret {
  return (GITHUB_REPO_APP_SECRETS as readonly string[]).includes(name);
}

/** Hardcoded fallbacks for projects whose secrets aren't in GitHub. */
const PICKFLIX_HARDCODED_SECRETS: Record<string, string> = {
  DATABASE_URL: "noop",
  PORT: "9000",
  SECRET: "noop",
  SEND_GRID_API_KEY: "noop",
  SEND_GRID_REGISTERED_EMAIL_ADDRESS: "noop",
  SESSION_COOKIE_SECRET: "noop",
  YOUTUBE_API_KEY: "noop",
};

export function hardcodedSecretValue(projectId: string, secret: string): string | null {
  if (projectId === "pickflix") {
    return PICKFLIX_HARDCODED_SECRETS[secret] ?? null;
  }
  return null;
}
