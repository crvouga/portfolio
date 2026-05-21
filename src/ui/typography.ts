import type { ViewWithProps } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { THEME } from "./theme";

type Level =
  | "display"
  | "h1"
  | "h2"
  | "h3"
  | "title-sm"
  | "body-md"
  | "body-xs"
  | "eyebrow";

type Props = { level: Level; text: string };

const toClassName = (input: Props): string => {
  switch (input.level) {
    case "display":
      return "typography-display";
    case "h1":
      return "typography-h1";
    case "h2":
      return "typography-h2";
    case "h3":
      return "typography-h3";
    case "title-sm":
      return "typography-title-sm";
    case "body-md":
      return "typography-body-md";
    case "body-xs":
      return "typography-body-xs";
    case "eyebrow":
      return "typography-eyebrow";
  }
};

HEAD.push(
  tag("style", {}, [
    text(`
      h1, h2, h3, h4, p {
        margin: 0;
        padding: 0;
      }
      .typography-display {
        font-family: var(--font-mono);
        font-size: clamp(30px, 4.2vw, 44px);
        line-height: 1.1;
        letter-spacing: -0.02em;
        font-weight: 700;
        color: ${THEME.colors.text};
      }
      .typography-h1 {
        font-family: var(--font-mono);
        font-size: clamp(26px, 3.6vw, 36px);
        line-height: 1.15;
        letter-spacing: -0.015em;
        font-weight: 700;
        color: ${THEME.colors.text};
      }
      .typography-h2 {
        font-family: var(--font-mono);
        font-size: clamp(20px, 2.6vw, 26px);
        line-height: 1.2;
        letter-spacing: -0.01em;
        font-weight: 600;
        color: ${THEME.colors.text};
      }
      .typography-h3 {
        font-family: var(--font-sans);
        font-size: 20px;
        line-height: 1.3;
        letter-spacing: -0.01em;
        font-weight: 600;
        color: ${THEME.colors.text};
      }
      .typography-title-sm {
        font-family: var(--font-sans);
        font-size: 14px;
        line-height: 1.5;
        font-weight: 500;
        color: ${THEME.colors.textMuted};
      }
      .typography-body-md {
        font-family: var(--font-sans);
        font-size: 16px;
        line-height: 1.6;
        font-weight: 400;
        color: ${THEME.colors.textMuted};
      }
      .typography-body-xs {
        font-family: var(--font-sans);
        font-size: 12px;
        line-height: 1.5;
        font-weight: 400;
        color: ${THEME.colors.textMuted};
      }
      .typography-eyebrow {
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1.4;
        letter-spacing: 0.01em;
        font-weight: 500;
        color: ${THEME.colors.accent};
      }
    `),
  ])
);

const BASE_CLASS = "typography-base";

export const viewTypography: ViewWithProps<Props> = (props) => (attrs, children) => {
  const tagName = (() => {
    switch (props.level) {
      case "display":
        return "h1";
      case "h1":
        return "h1";
      case "h2":
        return "h2";
      case "h3":
        return "h3";
      case "title-sm":
        return "h4";
      case "body-md":
        return "p";
      case "body-xs":
        return "p";
      case "eyebrow":
        return "p";
    }
  })();

  const className = [BASE_CLASS, toClassName(props), attrs?.["class"]]
    .filter(Boolean)
    .join(" ");

  return tag(tagName, { ...attrs, class: className }, [
    text(props.text),
    ...(children ?? []),
  ]);
};
