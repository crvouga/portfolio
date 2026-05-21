import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { viewHeroCtas } from "./ctas";
import { viewHeroEyebrow } from "./eyebrow";
import { viewHeroName } from "./name";

export const viewHeadingSection: View = () => {
  return tag("header", { class: "hero", id: "hero" }, [
    viewHeroEyebrow(),
    viewHeroName(),
    viewHeroCtas(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .hero {
        display: flex;
        flex-direction: column;
        gap: 20px;
        align-items: flex-start;
      }
      .hero .hero-name {
        margin: -4px 0 0;
      }
    `),
  ])
);
