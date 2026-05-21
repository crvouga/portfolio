import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";

export const viewNavCta: View = () => {
  const contact = CONTENT.GET_SECTION("contact");
  return tag(
    "a",
    {
      class: "nav-cta",
      href: `#${contact.id}`,
    },
    [text(contact.navLabel.toLowerCase())]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .nav-cta {
        font-family: var(--font-mono);
        font-size: 12px;
        font-weight: 500;
        letter-spacing: 0.02em;
        color: var(--accent);
        text-decoration: none;
        padding: 8px 12px;
        border-radius: var(--radius-pill);
        background: var(--accent-soft);
        border: 1px solid rgba(127, 179, 255, 0.18);
        transition: background var(--motion-fast) var(--motion-ease),
          border-color var(--motion-fast) var(--motion-ease);
        line-height: 1;
        white-space: nowrap;
      }
      .nav-cta::before {
        content: "→ ";
        color: var(--accent);
      }
      .nav-cta:hover {
        background: rgba(127, 179, 255, 0.18);
        border-color: var(--accent);
      }
    `),
  ])
);
