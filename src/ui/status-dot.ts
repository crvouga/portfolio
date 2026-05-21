import { tag } from "../library/html/index";
import type { ViewWithProps } from "../library/html/index";
import { text } from "../library/html/index";
import { HEAD } from "./head";

type Tone = "live" | "warn" | "muted";

type Props = {
  tone: Tone;
};

const toneToClass = (tone: Tone): string => {
  switch (tone) {
    case "live":
      return "status-dot-live";
    case "warn":
      return "status-dot-warn";
    case "muted":
      return "status-dot-muted";
  }
};

export const viewStatusDot: ViewWithProps<Props> = (props) => (attrs) => {
  return tag(
    "span",
    {
      ...attrs,
      class: ["status-dot", toneToClass(props.tone), attrs?.["class"]]
        .filter(Boolean)
        .join(" "),
      "aria-hidden": "true",
    },
    []
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .status-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        flex-shrink: 0;
        position: relative;
      }
      .status-dot::after {
        content: "";
        position: absolute;
        inset: -4px;
        border-radius: 999px;
        opacity: 0.35;
        animation: status-dot-pulse 2.4s ease-out infinite;
      }
      .status-dot-live {
        background: #3FB950;
        box-shadow: 0 0 0 1px rgba(63, 185, 80, 0.25);
      }
      .status-dot-live::after {
        background: #3FB950;
      }
      .status-dot-warn {
        background: #EA9A3E;
        box-shadow: 0 0 0 1px rgba(234, 154, 62, 0.25);
      }
      .status-dot-warn::after {
        background: #EA9A3E;
      }
      .status-dot-muted {
        background: var(--text-subtle);
        box-shadow: 0 0 0 1px rgba(140, 140, 150, 0.2);
      }
      .status-dot-muted::after {
        background: var(--text-subtle);
        animation: none;
      }
      @keyframes status-dot-pulse {
        0%   { transform: scale(0.75); opacity: 0.35; }
        70%  { transform: scale(1.5);  opacity: 0;    }
        100% { transform: scale(1.5);  opacity: 0;    }
      }
      @media (prefers-reduced-motion: reduce) {
        .status-dot::after { animation: none; }
      }
    `),
  ])
);
