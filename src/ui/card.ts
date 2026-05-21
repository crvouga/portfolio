import type { View } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { HEAD } from "./head";

export const viewCard: View = (attr, children) => {
  return tag(
    "article",
    {
      ...attr,
      class: ["card", attr?.["class"]].filter(Boolean).join(" "),
    },
    children
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .card {
        display: flex;
        flex-direction: column;
        background-color: var(--paper);
        border: 1px solid var(--paper-border);
        border-radius: var(--radius-lg);
        overflow: hidden;
        height: 100%;
      }
    `),
  ])
);

export const viewCardContent: View = (attrs, children) => {
  return tag(
    "div",
    {
      ...attrs,
      class: ["card-content", attrs?.["class"]].filter(Boolean).join(" "),
    },
    children
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .card-content {
        padding: 24px;
        height: 100%;
        display: flex;
        flex-direction: column;
      }
    `),
  ])
);

export const viewCardActions: View = (attrs, children) => {
  return tag(
    "div",
    {
      ...attrs,
      class: ["card-actions", attrs?.["class"]].filter(Boolean).join(" "),
    },
    children
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .card-actions {
        display: flex;
        padding-top: 16px;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        gap: 12px;
      }
    `),
  ])
);
