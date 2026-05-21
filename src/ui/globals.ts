import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { THEME } from "./theme";

HEAD.push(
  tag("style", {}, [
    text(`
      *,
      *::before,
      *::after {
        box-sizing: border-box;
      }
      * {
        font-family: var(--font-sans);
        touch-action: manipulation !important;
      }

      html, body, h1, h2, h3, h4, h5, h6, p, figure, blockquote, dl, dd,
      ul, ol, fieldset, legend {
        margin: 0;
        padding: 0;
      }

      ul, ol {
        list-style: none;
      }

      html {
        overflow-y: scroll;
        background-color: ${THEME.colors.background};
        color: ${THEME.colors.text};
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }

      body {
        background-color: ${THEME.colors.background};
        color: ${THEME.colors.text};
        overflow-x: hidden;
        overflow-y: auto;
        position: relative;
        min-height: 100vh;
        line-height: 1.5;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      img, picture, video, canvas, svg {
        display: block;
        max-width: 100%;
      }

      input, button, textarea, select {
        font: inherit;
        color: inherit;
      }

      button {
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
      }

      a,
      a:visited,
      a:active,
      a:hover {
        color: inherit;
        text-decoration: none;
        background-color: transparent;
      }

      a.btn,
      a.btn:visited,
      a.btn:hover,
      a.btn:active,
      a.btn:focus {
        text-decoration: none;
      }

      a:focus-visible {
        outline: 2px solid ${THEME.colors.accent};
        outline-offset: 2px;
        border-radius: 2px;
      }

      .inline-link {
        color: ${THEME.colors.text};
        text-decoration: underline;
        text-decoration-color: ${THEME.colors.accent};
        text-decoration-thickness: 1px;
        text-underline-offset: 3px;
        transition: text-decoration-color var(--motion-fast) var(--motion-ease),
          color var(--motion-fast) var(--motion-ease);
      }
      .inline-link:hover {
        color: ${THEME.colors.accent};
        text-decoration-color: ${THEME.colors.accent};
      }

      ::selection {
        background: ${THEME.colors.accentSoft};
        color: ${THEME.colors.text};
      }

      ::-webkit-scrollbar {
        width: 12px;
      }
      ::-webkit-scrollbar-track {
        background: ${THEME.colors.background};
      }
      ::-webkit-scrollbar-thumb {
        background-color: ${THEME.colors.paperBorder};
        border-radius: 6px;
        border: 3px solid ${THEME.colors.background};
      }
      body {
        scrollbar-width: auto;
        scrollbar-color: ${THEME.colors.paperBorder} ${THEME.colors.background};
      }
      body {
        -ms-overflow-style: scrollbar;
      }

      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border-width: 0;
      }
    `),
  ])
);
