import { tag, text } from "../library/html/index";
import type { ViewWithProps } from "../library/html/index";
import { HEAD } from "./head";

type Props = {
  initials: string;
  size?: "sm" | "md";
};

const sizeToClass = (size: Props["size"]): string => {
  switch (size) {
    case "sm":
      return "monogram-sm";
    case "md":
    default:
      return "monogram-md";
  }
};

export const viewMonogram: ViewWithProps<Props> = (props) => (attrs) => {
  return tag(
    "span",
    {
      ...attrs,
      class: ["monogram", sizeToClass(props.size), attrs?.["class"]]
        .filter(Boolean)
        .join(" "),
      "aria-label": `${props.initials} monogram`,
    },
    [text(props.initials)]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .monogram {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        font-weight: 600;
        letter-spacing: 0;
        color: var(--text);
        background:
          linear-gradient(180deg, rgba(127, 179, 255, 0.18), rgba(127, 179, 255, 0.04));
        border: 1px solid var(--paper-border);
        border-radius: var(--radius-md);
        transition: border-color var(--motion-fast) var(--motion-ease),
          background var(--motion-fast) var(--motion-ease);
      }
      .monogram:hover {
        border-color: var(--accent);
      }
      .monogram-sm {
        width: 28px;
        height: 28px;
        font-size: 12px;
      }
      .monogram-md {
        width: 36px;
        height: 36px;
        font-size: 14px;
      }
    `),
  ])
);
