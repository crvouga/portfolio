import { tag, text } from "../library/html/index";
import { HEAD } from "./head";
import { THEME } from "./theme";

const FONT_SANS = `"Inter Variable", -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"`;

const FONT_MONO = `"JetBrains Mono Variable", "SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace`;

HEAD.push(
  tag("style", {}, [
    text(`
      @font-face {
        font-family: "Inter Variable";
        src: url("/fonts/inter-variable.woff2") format("woff2-variations");
        font-weight: 100 900;
        font-style: normal;
        font-display: swap;
      }

      @font-face {
        font-family: "JetBrains Mono Variable";
        src: url("/fonts/jetbrains-mono-variable.woff2") format("woff2-variations");
        font-weight: 100 800;
        font-style: normal;
        font-display: swap;
      }

      :root {
        --font-sans: ${FONT_SANS};
        --font-mono: ${FONT_MONO};
        --font-display: ${FONT_MONO};
        --accent: ${THEME.colors.accent};
        --accent-strong: ${THEME.colors.accentStrong};
        --accent-deep: ${THEME.colors.accentDeep};
        --accent-glow: ${THEME.colors.accentGlow};
        --accent-soft: ${THEME.colors.accentSoft};
        --paper: ${THEME.colors.paper};
        --paper-border: ${THEME.colors.paperBorder};
        --paper-border-hover: ${THEME.colors.paperBorderHover};
        --text: ${THEME.colors.text};
        --text-muted: ${THEME.colors.textMuted};
        --text-subtle: ${THEME.colors.textSubtle};
        --motion-fast: ${THEME.motion.fast};
        --motion-med: ${THEME.motion.med};
        --motion-ease: ${THEME.motion.ease};
        --radius-sm: ${THEME.radius.sm};
        --radius-md: ${THEME.radius.md};
        --radius-lg: ${THEME.radius.lg};
        --radius-pill: ${THEME.radius.pill};
      }

      html {
        scroll-behavior: smooth;
        scroll-padding-top: 96px;
      }
    `),
  ])
);
