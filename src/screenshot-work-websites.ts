import { mkdir } from "fs/promises";
import { WORK } from "./content/work";
import { PUBLIC_DIR, runScreenshotJobs, type ScreenshotJob } from "./screenshot-helpers";

const nameToFilename = (name: string): string => name.toLowerCase().replace(/\s+/g, "-");

const main = async (): Promise<void> => {
  console.log("Starting screenshot capture for work websites...\n");
  await mkdir(PUBLIC_DIR, { recursive: true });

  const jobs: ScreenshotJob[] = WORK.flatMap((work) => {
    if (!work.infoUrl) return [];
    return [
      {
        name: work.name,
        url: work.infoUrl,
        filename: nameToFilename(work.name),
      },
    ];
  });

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
