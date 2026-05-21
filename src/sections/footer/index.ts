import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { viewFooterBrand } from "./brand";
import { viewFooterCredit } from "./credit";
import { viewFooterLinks } from "./links";

export const viewFooterSection: View = () => {
  return tag("footer", { class: "footer", role: "contentinfo" }, [
    tag("div", { class: "footer-inner" }, [
      viewFooterBrand(),
      viewFooterCredit(),
      viewFooterLinks(),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .footer {
        width: 100%;
        border-top: 1px solid var(--paper-border);
        padding: 40px 24px;
        margin-top: 0;
      }
      .footer-inner {
        max-width: 1200px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
      }
      @media (min-width: 700px) {
        .footer-inner {
          flex-direction: row;
          justify-content: space-between;
          gap: 16px;
        }
      }
    `),
  ])
);
