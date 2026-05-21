import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { viewMonogram } from "../../ui/monogram";

export const viewFooterBrand: View = () => {
  return tag("div", { class: "footer-brand" }, [
    viewMonogram({ initials: CONTENT.MONOGRAM_INITIALS, size: "sm" })(),
    tag("div", { class: "footer-brand-text" }, [
      tag("span", { class: "footer-brand-name" }, [
        text(CONTENT.FOOTER_COPY.brand),
      ]),
      tag("span", { class: "footer-brand-location" }, [
        text(CONTENT.FOOTER_COPY.location),
      ]),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .footer-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .footer-brand-text {
        display: flex;
        flex-direction: column;
        line-height: 1.25;
      }
      .footer-brand-name {
        font-family: var(--font-sans);
        font-size: 14px;
        font-weight: 500;
        color: var(--text);
      }
      .footer-brand-location {
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-muted);
        letter-spacing: 0.04em;
      }
    `),
  ])
);
