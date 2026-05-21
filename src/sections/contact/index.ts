import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { viewSection } from "../../shared/section";
import { HEAD } from "../../ui/head";
import { viewContactActions } from "./actions";
import { viewContactHeading } from "./heading";

export const viewContactSection: View = () => {
  const section = CONTENT.GET_SECTION("contact");
  return viewSection({
    title: section.title,
    number: section.number,
  })({ id: section.id, class: "contact-section" }, [
    tag("div", { class: "contact-section-inner" }, [
      viewContactHeading(),
      viewContactActions(),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .contact-section-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 32px;
        padding: 16px 0;
      }
    `),
  ])
);
