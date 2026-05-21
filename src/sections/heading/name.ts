import { CONTENT } from "../../content/content";
import type { View } from "../../library/html/index";
import { viewTypography } from "../../ui/typography";

export const viewHeroName: View = () => {
  return viewTypography({ level: "display", text: CONTENT.HERO.name })({
    class: "hero-name",
  });
};
