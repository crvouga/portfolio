import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { viewLink } from "../../ui/link";

export const viewFooterCredit: View = () => {
  return tag("div", { class: "footer-credit" }, [
    tag("span", { class: "footer-credit-text" }, [
      text(CONTENT.FOOTER_COPY.creditText),
    ]),
    viewLink(
      {
        target: "_blank",
        rel: "noopener noreferrer",
        href: CONTENT.SITE_SOURCE_CODE_URL,
        class: "footer-credit-link",
      },
      [text(CONTENT.FOOTER_COPY.sourceLinkLabel)]
    ),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .footer-credit {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        text-align: center;
      }
      .footer-credit-text {
        font-family: var(--font-sans);
        font-size: 12px;
        color: var(--text-subtle);
      }
      .footer-credit-link {
        font-family: var(--font-mono);
        font-size: 12px;
        color: var(--text-muted);
        letter-spacing: 0.04em;
        text-decoration: none;
        transition: color var(--motion-fast) var(--motion-ease);
      }
      .footer-credit-link:hover {
        color: var(--accent);
      }
    `),
  ])
);
