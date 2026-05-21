import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { viewEmailButton } from "../../shared/email-button";
import { viewGithubButton } from "../../shared/github-button";
import { viewLinkedInButton } from "../../shared/linkedin-button";
import { viewResumeButton } from "../../shared/resume-button";
import { HEAD } from "../../ui/head";

export const viewHeroCtas: View = () => {
  return tag("div", { class: "hero-ctas" }, [
    viewEmailButton({ label: CONTENT.HERO.ctaPrimary.label })(),
    viewResumeButton({})(),
    viewGithubButton({})(),
    viewLinkedInButton({})(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .hero-ctas {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }
    `),
  ])
);
