import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { viewSection } from "../../shared/section";
import { HEAD } from "../../ui/head";
import { viewAboutCopy } from "./copy";
import { viewAboutCursorCard } from "./cursor-card";

export const viewAboutMeSection: View = () => {
  const section = CONTENT.GET_SECTION("about");
  return viewSection({
    title: section.title,
    number: section.number,
  })({ id: section.id }, [
    tag("div", { class: "about-grid" }, [
      tag("div", { class: "about-grid-left" }, [viewAboutCopy()]),
      tag("div", { class: "about-grid-right" }, [viewAboutCursorCard()]),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .about-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 40px;
        align-items: start;
      }
      .about-grid-left {
        display: flex;
        flex-direction: column;
        gap: 24px;
      }
      .about-grid-right {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      @media (min-width: 900px) {
        .about-grid {
          grid-template-columns: 1.1fr 0.9fr;
          gap: 48px;
        }
      }
    `),
  ])
);
