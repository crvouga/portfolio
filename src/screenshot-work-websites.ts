import { mkdir } from "node:fs/promises";
import { PUBLIC_DIR, runScreenshotJobs } from "./screenshot-helpers";
import { buildWorkJobs } from "./screenshot-jobs";

const main = async (): Promise<void> => {
  console.log("Starting screenshot capture for work websites...\n");
  await mkdir(PUBLIC_DIR, { recursive: true });

  const jobs = buildWorkJobs();
  if (jobs.length === 0) {
    console.log("No work entries with infoUrl found.");
    return;
  }

  console.log(`Found ${jobs.length} work entr${jobs.length === 1 ? "y" : "ies"} with URLs.\n`);
  await runScreenshotJobs("work-websites", jobs);
  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
