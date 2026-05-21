/**
 * Single source of truth for the list of screenshot jobs the orchestrator
 * runs. Built from the same content modules the standalone scripts read so
 * the parallel pipeline and the per-collection scripts stay in lockstep.
 */
import { CONTENT } from "./content/content";
import { PROJECTS, type Project } from "./content/project";
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

/** Matches `/foo-screenshot.png` and `./foo-screenshot.optimized.webp`. */
const SCREENSHOT_BASENAME =
  /(?:^\.?\/)?([^/]+)-screenshot\.(?:png|optimized\.webp)$/i;

/** Prefer paths declared on the project over title slugs (e.g. geviti-app vs Geviti). */
const screenshotBasenameFromProject = (project: Project): string => {
  const paths = [...project.galleryImageSrc, ...project.imageSrc].filter(
    (src): src is string => typeof src === "string" && !src.startsWith("http"),
  );
  for (const src of paths) {
    const match = src.match(SCREENSHOT_BASENAME);
    if (match) return match[1];
  }
  return titleToFilename(project.title);
};

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
    return [
      {
        name: p.title,
        url: p.deployment.url,
        filename: screenshotBasenameFromProject(p),
      },
    ];
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
