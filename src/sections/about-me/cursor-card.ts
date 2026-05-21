import { CONTENT } from "../../content/content";
import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { viewCard, viewCardContent } from "../../ui/card";
import { HEAD } from "../../ui/head";
import { viewTypography } from "../../ui/typography";
import { viewYouTubeVideo } from "../../ui/youtube-video";

export const viewAboutCursorCard: View = () => {
  return viewCard({ class: "about-cursor-card" }, [
    viewYouTubeVideo({
      src: CONTENT.ABOUT_YOUTUBE_EMBED_URL,
      title: CONTENT.ABOUT_YOUTUBE_VIDEO_TITLE,
    })(),
    viewCardContent({}, [
      tag("div", { class: "about-cursor-card-badge" }, [
        text("Recognized by Cursor"),
      ]),
      viewTypography({
        level: "body-md",
        text: CONTENT.ABOUT_CURSOR_GIFT_TEXT,
      })({ style: { "margin-top": "8px" } }),
    ]),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .about-cursor-card-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-family: var(--font-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
        padding: 4px 8px;
        background: var(--accent-soft);
        border: 1px solid rgba(127, 179, 255, 0.22);
        border-radius: var(--radius-pill);
        align-self: flex-start;
      }
    `),
  ])
);
