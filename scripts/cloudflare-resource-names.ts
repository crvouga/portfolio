/**
 * Cloudflare resource naming — PORTFOLIO_ prefix groups all resources in this
 * worker (shared Cloudflare account with other projects).
 */

/** Namespace prefix for bindings and Secrets Store (SCREAMING_SNAKE). */
export const RESOURCE_PREFIX = "PORTFOLIO";

/** Worker script name in wrangler.toml */
export const WORKER_NAME = "chrisvouga-containers";

/** v1 class names (legacy — do not remove after first deploy). */
export const LEGACY_MIGRATION_TAG = "v1";

export const LEGACY_CONTAINER_CLASS_NAMES = [
  "Portfolio",
  "Pickflix",
  "HeadlessComboboxSvelteExample",
  "HeadlessComboboxDocs",
  "TodoApp",
  "ImageService",
  "ConnectFour",
  "NormalizerApp",
  "ScreenshotService",
  "SmartDogDoor",
  "QuizMaker",
  "AnimeBlog",
  "SnakeGame",
  "MatchThree",
  "MoviefinderAppRust",
  "MoviefinderAppGo",
  "MoviefinderAppReact",
  "MoviefinderAppClojurescript",
  "SimonSays",
] as const;

export const PREFIXED_MIGRATION_TAG = "v2-portfolio-prefix";

export function pascalCase(id: string): string {
  return id
    .split(/[-_.]/)
    .map((p) => (p.length === 0 ? "" : p[0]!.toUpperCase() + p.slice(1)))
    .join("");
}

function projectSlug(projectId: string): string {
  return projectId.toUpperCase().replace(/[-.]/g, "_");
}

/** Durable Object / Worker env binding (e.g. PORTFOLIO_PICKFLIX). */
export function doBindingName(projectId: string): string {
  return `${RESOURCE_PREFIX}_${projectSlug(projectId)}`;
}

/** Container + Durable Object class (e.g. Portfolio_Pickflix). */
export function containerClassName(projectId: string): string {
  return `${RESOURCE_PREFIX.charAt(0)}${RESOURCE_PREFIX.slice(1).toLowerCase()}_${pascalCase(projectId)}`;
}

/** Secrets Store project segment (e.g. PORTFOLIO_PICKFLIX). */
export function secretsProjectPrefix(projectId: string): string {
  return `${RESOURCE_PREFIX}_${projectSlug(projectId)}`;
}
