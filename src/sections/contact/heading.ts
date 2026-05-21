import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { viewTypography } from "../../ui/typography";

export const viewContactHeading: View = () => {
  return tag("div", { class: "contact-heading" }, [
    viewTypography({ level: "h1", text: CONTENT.CONTACT_COPY.headline })({
      class: "contact-heading-h",
    }),
    viewTypography({ level: "body-md", text: CONTENT.CONTACT_COPY.sub })({
      class: "contact-heading-sub",
    }),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .contact-heading {
        display: flex;
        flex-direction: column;
        gap: 12px;
        text-align: center;
        align-items: center;
      }
      .contact-heading-h {
        max-width: 720px;
      }
      .contact-heading-sub {
        max-width: 560px;
      }
    `),
  ])
);
