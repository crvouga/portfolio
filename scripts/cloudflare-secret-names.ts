/** Shared secret naming for Cloudflare Secrets Store bindings (used by generator + setup). */

export function projectBindingPrefix(projectId: string): string {
  return projectId.toUpperCase().replace(/[-.]/g, "_");
}

export function secretBindingName(projectId: string, secret: string): string {
  return `${projectBindingPrefix(projectId)}__${secret}`;
}

export const DEFAULT_SECRETS_STORE_ID = "chrisvouga";
