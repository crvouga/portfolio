import type { Deployment } from "../../../content/project";
import { tag, text } from "../../../library/html/index";
import type { View } from "../../../library/html/index";
import { HEAD } from "../../../ui/head";
import { viewStatusDot } from "../../../ui/status-dot";

type Tone = "live" | "warn" | "muted";

const toTone = (deployment: Deployment): Tone => {
  switch (deployment.t) {
    case "public":
      return "live";
    case "not-deployed-yet":
      return "warn";
    case "not-deployed-anymore":
    case "private":
      return "muted";
  }
};

const toLabel = (deployment: Deployment): string => {
  switch (deployment.t) {
    case "public":
      return "Live";
    case "not-deployed-yet":
      return "Soon";
    case "not-deployed-anymore":
      return "Archived";
    case "private":
      return "Private";
  }
};

export const viewProjectLiveIndicator = (props: { deployment: Deployment }): ReturnType<View> => {
  const tone = toTone(props.deployment);
  return tag("span", { class: `project-live project-live-${tone}` }, [
    viewStatusDot({ tone })(),
    tag("span", { class: "project-live-label" }, [text(toLabel(props.deployment))]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .project-live {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 10px 4px 8px;
        border: 1px solid var(--paper-border);
        border-radius: var(--radius-pill);
        background: rgba(255, 255, 255, 0.02);
        flex-shrink: 0;
      }
      .project-live-label {
        font-family: var(--font-mono);
        font-size: 11px;
        line-height: 1;
        letter-spacing: 0.06em;
        color: var(--text-muted);
      }
      .project-live-live {
        border-color: rgba(63, 185, 80, 0.28);
      }
      .project-live-live .project-live-label {
        color: #BFEEC7;
      }
    `),
  ])
);
