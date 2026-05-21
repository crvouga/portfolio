import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";

const LINK_SECTION_IDS = new Set(["work", "projects", "about", "education"]);

export const viewNavLinks: View = () => {
  const links = CONTENT.SECTIONS.filter((s) => LINK_SECTION_IDS.has(s.id));
  return tag(
    "nav",
    { class: "nav-links", "aria-label": "Section navigation" },
    links.map((s) =>
      tag(
        "a",
        {
          class: "nav-link",
          href: `#${s.id}`,
          "data-nav-target": s.id,
        },
        [text(s.navLabel)]
      )
    )
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .nav-links {
        display: none;
        align-items: center;
        gap: 2px;
      }
      .nav-link {
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0.02em;
        color: var(--text-muted);
        text-decoration: none;
        padding: 8px 12px;
        border-radius: var(--radius-pill);
        transition: color var(--motion-fast) var(--motion-ease),
          background-color var(--motion-fast) var(--motion-ease);
        line-height: 1;
      }
      .nav-link:hover {
        color: var(--text);
        background: rgba(255, 255, 255, 0.04);
      }
      .nav-link[data-active="true"] {
        color: var(--text);
        background: rgba(255, 255, 255, 0.05);
      }
      .nav-link[data-active="true"]::before {
        content: "./";
        color: var(--accent);
        margin-right: 2px;
      }

      @media (min-width: 700px) {
        .nav-links {
          display: flex;
        }
      }
    `),
  ])
);
