/** Shared secret naming for Cloudflare Secrets Store bindings (used by generator + setup). */

import { getDeployableProjects } from "../projects.js";

/**
 * App secrets that exist in GitHub repo settings (source of truth).
 * Each name is copied into every project's Secrets Store binding that needs it.
 */
export const GITHUB_REPO_APP_SECRETS = [
  "TMDB_API_READ_ACCESS_TOKEN",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_SERVICE_SID",
] as const;

export type GithubRepoAppSecret = (typeof GITHUB_REPO_APP_SECRETS)[number];

/** @deprecated Use GITHUB_REPO_APP_SECRETS */
export const SHARED_GITHUB_SECRETS = GITHUB_REPO_APP_SECRETS;
export type SharedGithubSecret = GithubRepoAppSecret;

export function projectBindingPrefix(projectId: string): string {
  return projectId.toUpperCase().replace(/[-.]/g, "_");
}

export function secretBindingName(projectId: string, secret: string): string {
  return `${projectBindingPrefix(projectId)}__${secret}`;
}

export function isGithubRepoAppSecret(secret: string): secret is GithubRepoAppSecret {
  return (GITHUB_REPO_APP_SECRETS as readonly string[]).includes(secret);
}

/** @deprecated Use isGithubRepoAppSecret */
export const isSharedSecret = isGithubRepoAppSecret;

/** GitHub repo secret name (only app secrets in GITHUB_REPO_APP_SECRETS are read from GitHub). */
export function githubSecretName(_projectId: string, secret: string): string | null {
  return isGithubRepoAppSecret(secret) ? secret : null;
}

export const DEFAULT_SECRETS_STORE_ID = "chrisvouga";

/** Placeholder values for pickflix secrets not stored in GitHub. */
export const PICKFLIX_HARDCODED_SECRETS: Record<string, string> = {
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

export type SecretSeedEntry = {
  readonly projectId: string;
  readonly secret: string;
  readonly binding: string;
  readonly source: "github" | "hardcoded";
  readonly githubSecret: string | null;
  readonly hardcodedValue: string | null;
};

/** Every Secrets Store binding to upsert on deploy. */
export function getSecretSeedPlan(): readonly SecretSeedEntry[] {
  const out: SecretSeedEntry[] = [];
  for (const project of getDeployableProjects()) {
    for (const secret of project.secrets ?? []) {
      const binding = secretBindingName(project.id, secret);
      const hardcoded = hardcodedSecretValue(project.id, secret);
      const githubSecret = githubSecretName(project.id, secret);
      if (githubSecret != null) {
        out.push({
          projectId: project.id,
          secret,
          binding,
          source: "github",
          githubSecret,
          hardcodedValue: null,
        });
      } else if (hardcoded != null) {
        out.push({
          projectId: project.id,
          secret,
          binding,
          source: "hardcoded",
          githubSecret: null,
          hardcodedValue: hardcoded,
        });
      }
    }
  }
  return out;
}

export type SecretBinding = {
  readonly projectId: string;
  readonly secret: string;
  readonly binding: string;
  readonly githubSecret: string;
};

/** Secrets Store bindings seeded from GitHub (subset of projects.ts secrets). */
export function getGithubBackedSecretBindings(): readonly SecretBinding[] {
  const out: SecretBinding[] = [];
  for (const project of getDeployableProjects()) {
    for (const secret of project.secrets ?? []) {
      const githubSecret = githubSecretName(project.id, secret);
      if (githubSecret == null) continue;
      out.push({
        projectId: project.id,
        secret,
        binding: secretBindingName(project.id, secret),
        githubSecret: githubSecret,
      });
    }
  }
  return out;
}

/** @deprecated Use getGithubBackedSecretBindings */
export const getAllSecretBindings = getGithubBackedSecretBindings;

/** GitHub repo secret names passed in the deployment pipeline seed step. */
export function getGithubRepoSecretNames(): readonly string[] {
  return [...GITHUB_REPO_APP_SECRETS];
}
