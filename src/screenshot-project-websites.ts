import { mkdir } from "fs/promises";
import { PROJECTS } from "./content/project";
import { PUBLIC_DIR, runScreenshotJobs, type ScreenshotJob } from "./screenshot-helpers";

const titleToFilename = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/\./g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const main = async (): Promise<void> => {
  console.log("Starting screenshot capture for project websites...\n");
  await mkdir(PUBLIC_DIR, { recursive: true });

  const jobs: ScreenshotJob[] = PROJECTS.flatMap((project) => {
    if (project.deployment.t !== "public") return [];
    if (!project.deployment.url) return [];
    return [
      {
        name: project.title,
        url: project.deployment.url,
        filename: titleToFilename(project.title),
      },
    ];
  });

  if (jobs.length === 0) {
    console.log("No projects with public deployments found.");
    return;
  }

  console.log(
    `Found ${jobs.length} project${jobs.length === 1 ? "" : "s"} with public deployments.\n`,
  );

  await runScreenshotJobs("project-websites", jobs);
  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  // Only reachable for things outside the per-job loop (e.g. mkdir failure).
  console.error("Fatal error:", error);
  process.exit(1);
});
