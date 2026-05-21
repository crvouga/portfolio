import { tag, text } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { viewNavCta } from "./cta";
import { viewNavLinks } from "./links";
import { viewNavMonogram } from "./monogram";
import { viewNavScrollspyScript } from "./scrollspy";

export const viewNavSection: View = () => {
  return tag("div", { class: "nav-shell" }, [
    tag("div", { class: "nav-bar", role: "banner" }, [
      tag("div", { class: "nav-bar-left" }, [viewNavMonogram()]),
      tag("div", { class: "nav-bar-center" }, [viewNavLinks()]),
      tag("div", { class: "nav-bar-right" }, [viewNavCta()]),
    ]),
    viewNavScrollspyScript(),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .nav-shell {
        position: fixed;
        top: 16px;
        left: 0;
        right: 0;
        z-index: 50;
        display: flex;
        justify-content: center;
        padding: 0 var(--page-pad);
        pointer-events: none;
      }

      .nav-bar {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        max-width: var(--page-max);
        padding: 6px 6px 6px 10px;
        background: rgba(10, 10, 11, 0.55);
        border: 1px solid var(--paper-border);
        border-radius: var(--radius-pill);
        backdrop-filter: saturate(140%) blur(14px);
        -webkit-backdrop-filter: saturate(140%) blur(14px);
        transition: background var(--motion-med) var(--motion-ease),
          border-color var(--motion-med) var(--motion-ease),
          box-shadow var(--motion-med) var(--motion-ease);
      }
      .nav-bar[data-elevated="true"] {
        background: rgba(10, 10, 11, 0.75);
        border-color: var(--paper-border-hover);
        box-shadow: 0 10px 30px -20px rgba(0, 0, 0, 0.8);
      }
      .nav-bar-left,
      .nav-bar-right {
        display: flex;
        align-items: center;
        flex-shrink: 0;
      }
      .nav-bar-center {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        min-width: 0;
      }
      .nav-monogram-link {
        display: inline-flex;
        line-height: 0;
        text-decoration: none;
      }
    `),
  ])
);
