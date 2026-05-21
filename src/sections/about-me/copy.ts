import { CONTENT } from "../../content/content";
import type { View } from "../../library/html/index";
import { viewTypography } from "../../ui/typography";

export const viewAboutCopy: View = () => {
  return viewTypography({ level: "body-md", text: CONTENT.ABOUT_ME })({
    class: "about-copy",
  });
};
