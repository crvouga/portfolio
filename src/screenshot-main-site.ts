import { mkdir } from "fs/promises";
import { CONTENT } from "./content/content";
import { PUBLIC_DIR, runScreenshotJobs } from "./screenshot-helpers";

const main = async (): Promise<void> => {
  console.log("Starting screenshot capture for main site...\n");
  await mkdir(PUBLIC_DIR, { recursive: true });

  if (!CONTENT.SITE_URL) {
    console.log("No SITE_URL configured; nothing to capture.");
    return;
  }

  await runScreenshotJobs("main-site", [
    { name: "Main Site", url: CONTENT.SITE_URL, filename: "main-site" },
  ]);
  console.log("\n✓ Screenshot capture complete!");
};

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
