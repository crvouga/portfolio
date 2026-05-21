import { type ViewWithProps, tag, text } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { THEME } from "../../ui/theme";
import { toCopyToClipboardOnClick } from "../copy-to-clipboard";

export const viewContactLinkButton: ViewWithProps<{ label: string; value: string }> = (props) => (attrs, _children) => {
  return tag(
    "button",
    {
      ...attrs,
      class: "contact-link-button",
      title: "Click to copy to clipboard",
      onclick: toCopyToClipboardOnClick(props.value, `Copied '${props.value}' to clipboard`),
    },
    [
      tag("span", { class: "contact-link-button-label" }, [text(props.label)]),
      tag("span", { class: "contact-link-button-value" }, [text(props.value)]),
    ]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
        .contact-link-button {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            border: none;
            background-color: transparent;
            cursor: pointer;
            font-size: 14px;
            padding: 0;
        }
        .contact-link-button-label {
            color: ${THEME.colors.neutralMuted};
            text-align: left;
        }
        .contact-link-button-value {
            color: ${THEME.colors.neutral};
            text-align: left;
        }
        .contact-link-button:hover .contact-link-button-value {
            opacity: 0.8;
            text-decoration: underline;
        }
        `),
  ])
);
