import { copyFile, mkdir } from "fs/promises";
import { dirname, join } from "path";

type FontCopy = {
  readonly source: string;
  readonly destination: string;
};

const FONTS: readonly FontCopy[] = [
  {
    source:
      "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
    destination: "fonts/inter-variable.woff2",
  },
  {
    source:
      "node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
    destination: "fonts/jetbrains-mono-variable.woff2",
  },
];

export const copyFontFiles = async (distPath: string): Promise<void> => {
  for (const font of FONTS) {
    const dest = join(distPath, font.destination);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(font.source, dest);
  }
};
