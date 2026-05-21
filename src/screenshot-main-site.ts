import { mkdir } from "node:fs/promises";
import { PUBLIC_DIR, runScreenshotJobs } from "./screenshot-helpers";
import { buildMainSiteJobs } from "./screenshot-jobs";

const main = async (): Promise<void> => {
  console.log("Starting screenshot capture for main site...\n");
  await mkdir(PUBLIC_DIR, { recursive: true });

  const jobs = buildMainSiteJobs();
  if (jobs.length === 0) {
    console.log("No SITE_URL configured; nothing to capture.");
    return;
  }

  await runScreenshotJobs("main-site", jobs);
  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
