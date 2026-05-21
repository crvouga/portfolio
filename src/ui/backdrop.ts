import { tag, text } from "../library/html/index";
import type { View } from "../library/html/index";
import { HEAD } from "./head";

export const viewBackdrop: View = () => {
  return tag("div", { class: "backdrop", "aria-hidden": "true" }, [
    tag("div", { class: "backdrop-grid" }, []),
    tag("div", { class: "backdrop-halo" }, []),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .backdrop {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: -1;
        overflow: hidden;
      }

      .backdrop-grid {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px);
        background-size: 28px 28px;
        background-position: 0 0;
        opacity: 0.6;
        mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
        -webkit-mask-image: linear-gradient(to bottom, black 0%, black 70%, transparent 100%);
      }

      .backdrop-halo {
        position: absolute;
        top: -260px;
        left: 50%;
        transform: translateX(-50%);
        width: min(1400px, 140vw);
        height: 900px;
        background: radial-gradient(
          ellipse at center,
          rgba(127, 179, 255, 0.22) 0%,
          rgba(76, 141, 232, 0.12) 28%,
          rgba(42, 111, 204, 0.05) 50%,
          transparent 70%
        );
        filter: blur(10px);
      }
    `),
  ])
);
