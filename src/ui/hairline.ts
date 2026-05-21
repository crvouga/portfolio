import { tag, text } from "../library/html/index";
import type { View } from "../library/html/index";
import { HEAD } from "./head";

export const viewHairline: View = (attrs) => {
  return tag(
    "span",
    {
      ...attrs,
      class: ["hairline", attrs?.["class"]].filter(Boolean).join(" "),
      "aria-hidden": "true",
    },
    []
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .hairline {
        display: block;
        flex: 1;
        height: 1px;
        background: var(--paper-border);
        min-width: 24px;
      }
    `),
  ])
);
