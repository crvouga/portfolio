/**
 * Single source of truth for the list of screenshot jobs the orchestrator
 * runs. Built from the same content modules the standalone scripts read so
 * the parallel pipeline and the per-collection scripts stay in lockstep.
 */
import { CONTENT } from "./content/content";
import { PROJECTS } from "./content/project";
import { WORK } from "./content/work";
import type { ScreenshotJob } from "./screenshot-helpers";

const titleToFilename = (title: string): string =>
  title
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const nameToFilename = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, "-");

export function buildWorkJobs(): ScreenshotJob[] {
  return WORK.flatMap((w) =>
    w.infoUrl ? [{ name: w.name, url: w.infoUrl, filename: nameToFilename(w.name) }] : [],
  );
}

export function buildProjectJobs(): ScreenshotJob[] {
  return PROJECTS.flatMap((p) => {
    if (p.deployment.t !== "public" || !p.deployment.url) return [];
    return [{ name: p.title, url: p.deployment.url, filename: titleToFilename(p.title) }];
  });
}

export function buildMainSiteJobs(): ScreenshotJob[] {
  if (!CONTENT.SITE_URL) return [];
  return [{ name: "Main Site", url: CONTENT.SITE_URL, filename: "main-site" }];
}

/** Union of every screenshot job the portfolio depends on. */
export function buildAllScreenshotJobs(): ScreenshotJob[] {
  return [...buildWorkJobs(), ...buildProjectJobs(), ...buildMainSiteJobs()];
}
