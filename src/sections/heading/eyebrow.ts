import { CONTENT } from "../../content/content";
import type { View } from "../../library/html/index";
import { viewTypography } from "../../ui/typography";

export const viewHeroEyebrow: View = () => {
  return viewTypography({ level: "eyebrow", text: CONTENT.HERO.eyebrow })();
};
