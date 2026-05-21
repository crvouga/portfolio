import { tag, text } from "../library/html/index";
import type { ViewWithProps } from "../library/html/index";
import { HEAD } from "./head";

type Props = {
  yearStart: number;
  yearEnd: number | "Present";
};

const formatRange = (start: number, end: number | "Present"): string => {
  return `${start} — ${end}`;
};

export const viewDatePill: ViewWithProps<Props> = (props) => (attrs) => {
  return tag(
    "span",
    {
      ...attrs,
      class: ["date-pill", attrs?.["class"]].filter(Boolean).join(" "),
    },
    [text(formatRange(props.yearStart, props.yearEnd))]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .date-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 11px;
        line-height: 1;
        letter-spacing: 0.04em;
        color: var(--text-muted);
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid var(--paper-border);
        padding: 5px 9px;
        border-radius: var(--radius-pill);
        white-space: nowrap;
      }
    `),
  ])
);
