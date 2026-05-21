import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { viewButton } from "../../ui/button";
import { HEAD } from "../../ui/head";
import { github, linkedIn } from "../../ui/icons";

export const viewFooterLinks: View = () => {
  return tag("div", { class: "footer-links" }, [
    viewButton({
      tag: "a",
      variant: "plain",
      size: "sm",
      disabled: false,
      startDecorator: github,
      text: "GitHub",
    })({
      href: CONTENT.GITHUB_URL,
      target: "_blank",
      rel: "noreferrer noopener",
    }),
    viewButton({
      tag: "a",
      variant: "plain",
      size: "sm",
      disabled: false,
      startDecorator: linkedIn,
      text: "LinkedIn",
    })({
      href: CONTENT.LINKEDIN_URL,
      target: "_blank",
      rel: "noreferrer noopener",
    }),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .footer-links {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
        justify-content: center;
      }
    `),
  ])
);
