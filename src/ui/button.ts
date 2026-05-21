import type { View, ViewWithProps } from "../library/html/index";
import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { THEME } from "./theme";

type Props = {
  tag: string;
  startDecorator: View | null;
  size: "sm" | "lg" | "xl";
  variant: "soft" | "plain" | "contained";
  disabled: boolean;
  text: string;
};

const toTag = (input: Props): string => {
  return input.tag;
};

const toClassName = (props: Props): string => {
  const classNames: string[] = [];
  classNames.push("btn");
  switch (props.variant) {
    case "soft":
      classNames.push("btn-soft");
      break;
    case "plain":
      classNames.push("btn-plain");
      break;
    case "contained":
      classNames.push("btn-contained");
      break;
  }

  switch (props.size) {
    case "sm":
      classNames.push("btn-sm");
      break;
    case "lg":
      classNames.push("btn-lg");
      break;
    case "xl":
      classNames.push("btn-xl");
      break;
  }

  if (props.disabled) {
    classNames.push("btn-disabled");
  }

  return classNames.join(" ");
};

export const viewButton: ViewWithProps<Props> = (props) => (attrs, children) => {
  const tagName = toTag(props);
  const baseClass = toClassName(props);
  const extraClass = typeof attrs?.["class"] === "string" ? (attrs["class"] as string) : "";

  return tag(
    tagName,
    {
      ...(props.disabled
        ? {
            disabled: "true",
            "aria-disabled": "true",
            tabindex: "-1",
          }
        : {}),
      ...attrs,
      class: extraClass ? `${baseClass} ${extraClass}` : baseClass,
    },
    [
      ...(props.startDecorator
        ? [
            props.startDecorator({
              class: "btn-start-decorator",
            }),
          ]
        : []),
      text(props.text),
      ...(children ?? []),
    ]
  );
};

export const viewButtonStyles: ViewWithProps<Record<string, never>> = (_props) => (_attrs, _children) => {
  return tag("style", {}, [
    text(`
      .btn {
        font-family: var(--font-mono);
        font-weight: 500;
        letter-spacing: 0.01em;
        user-select: none;
        transition:
          background-color var(--motion-fast) var(--motion-ease),
          color var(--motion-fast) var(--motion-ease),
          border-color var(--motion-fast) var(--motion-ease);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;
        text-overflow: ellipsis;
        overflow: hidden;
        border: 1px solid transparent;
        outline: none;
      }

      .btn:focus-visible {
        outline: 2px solid ${THEME.colors.accent};
        outline-offset: 2px;
      }

      .btn-sm {
        padding: 6px 14px;
        font-size: 13px;
        line-height: 20px;
        border-radius: var(--radius-md);
      }
      .btn-lg {
        padding: 11px 22px;
        font-size: 15px;
        line-height: 22px;
        border-radius: var(--radius-md);
      }
      .btn-xl {
        padding: 14px 26px;
        font-size: 16px;
        line-height: 24px;
        border-radius: var(--radius-md);
      }

      .btn-start-decorator {
        flex-shrink: 0;
        margin-right: 8px;
        margin-left: -2px;
        color: inherit;
      }
      .btn-start-decorator svg {
        display: block;
        width: 100%;
        height: 100%;
        color: inherit;
      }
      .btn-sm > .btn-start-decorator { width: 16px; height: 16px; }
      .btn-lg > .btn-start-decorator { width: 18px; height: 18px; }
      .btn-xl > .btn-start-decorator { width: 20px; height: 20px; }

      .btn.btn-disabled {
        cursor: not-allowed;
        pointer-events: none;
        opacity: 0.5;
      }

      .btn-soft,
      a.btn-soft,
      a.btn-soft:visited,
      a.btn-soft:hover,
      a.btn-soft:active,
      a.btn-soft:focus {
        background-color: ${THEME.colors.softBackground};
        color: ${THEME.colors.softText};
        border-color: rgba(127, 179, 255, 0.18);
      }
      .btn-soft:hover,
      a.btn-soft:hover {
        background-color: ${THEME.colors.softBackgroundHover};
        color: ${THEME.colors.softTextHover};
        border-color: ${THEME.colors.accent};
      }
      .btn-soft:active,
      a.btn-soft:active {
        background-color: ${THEME.colors.softBackgroundActive};
        color: ${THEME.colors.softTextActive};
      }

      .btn-plain,
      a.btn-plain,
      a.btn-plain:visited,
      a.btn-plain:hover,
      a.btn-plain:active,
      a.btn-plain:focus {
        background-color: ${THEME.colors.plainBackground};
        color: ${THEME.colors.plainText};
      }
      .btn-plain:hover,
      a.btn-plain:hover {
        background-color: ${THEME.colors.plainBackgroundHover};
        color: ${THEME.colors.plainTextHover};
      }
      .btn-plain:active,
      a.btn-plain:active {
        background-color: ${THEME.colors.plainBackgroundActive};
        color: ${THEME.colors.plainTextActive};
      }

      .btn-contained,
      a.btn-contained,
      a.btn-contained:visited,
      a.btn-contained:hover,
      a.btn-contained:active,
      a.btn-contained:focus,
      button.btn-contained,
      button.btn-contained:hover,
      button.btn-contained:active,
      button.btn-contained:focus {
        background-color: ${THEME.colors.containedBackground};
        color: ${THEME.colors.containedText};
        font-weight: 600;
      }
      .btn-contained:hover,
      a.btn-contained:hover,
      button.btn-contained:hover {
        background-color: ${THEME.colors.containedBackgroundHover};
        color: ${THEME.colors.containedTextHover};
      }
      .btn-contained:active,
      a.btn-contained:active,
      button.btn-contained:active {
        background-color: ${THEME.colors.containedBackgroundActive};
        color: ${THEME.colors.containedTextActive};
      }

      .btn .btn-start-decorator svg {
        fill: currentColor;
      }
      .btn .btn-start-decorator svg path[stroke] {
        fill: none;
        stroke: currentColor;
      }

      .btn-soft.btn-disabled,
      a.btn-soft.btn-disabled,
      a.btn-soft.btn-disabled:visited {
        color: ${THEME.colors.softTextDisabled};
      }
      .btn-plain.btn-disabled,
      a.btn-plain.btn-disabled,
      a.btn-plain.btn-disabled:visited {
        color: ${THEME.colors.plainTextDisabled};
      }
    `),
  ]);
};

HEAD.push(viewButtonStyles({})());
