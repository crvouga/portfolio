import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { viewEmailButton } from "../../shared/email-button";
import { viewGithubButton } from "../../shared/github-button";
import { viewLinkedInButton } from "../../shared/linkedin-button";
import { viewResumeButton } from "../../shared/resume-button";
import { HEAD } from "../../ui/head";

export const viewContactActions: View = () => {
  return tag("div", { class: "contact-actions" }, [
    viewEmailButton({ label: CONTENT.CONTACT_COPY.ctaPrimary.label })(),
    viewResumeButton({})(),
    viewGithubButton({})(),
    viewLinkedInButton({})(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .contact-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        justify-content: center;
      }
    `),
  ])
);
