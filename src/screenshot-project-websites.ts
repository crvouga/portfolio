import { mkdir } from "node:fs/promises";
import { PUBLIC_DIR, runScreenshotJobs } from "./screenshot-helpers";
import { buildProjectJobs } from "./screenshot-jobs";

const main = async (): Promise<void> => {
  console.log("Starting screenshot capture for project websites...\n");
  await mkdir(PUBLIC_DIR, { recursive: true });

  const jobs = buildProjectJobs();
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
  console.error("Fatal error:", error);
  process.exit(1);
});
