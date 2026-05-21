const accent = "#7FB3FF";
const accentStrong = "#4C8DE8";
const accentDeep = "#1E5BAF";
const accentGlow = "rgba(127, 179, 255, 0.18)";
const accentSoft = "rgba(127, 179, 255, 0.12)";

const background = "#0A0A0B";
const paper = "#101013";
const paperBorder = "#1F1F25";
const paperBorderHover = "#2E2E36";

const text = "#F2F4F8";
const textMuted = "#A3ABBA";
const textSubtle = "#727A88";

export const THEME = {
  colors: {
    background,
    paper,
    paperBorder,
    paperBorderHover,
    text,
    neutral: text,
    neutralMuted: textMuted,
    textMuted,
    textSubtle,
    borderLight: paperBorder,
    skeleton: "#1A1A1F",
    warning: "#EA9A3E",
    success: "#3FB950",
    //
    accent,
    accentStrong,
    accentDeep,
    accentGlow,
    accentSoft,
    //
    primary100: "rgb(223, 240, 252)",
    primary200: "rgb(197, 227, 248)",
    primary300: accent,
    primary400: accentStrong,
    primary500: accentStrong,
    primary600: accentDeep,
    primary700: accentDeep,
    //
    softBackground: accentSoft,
    softBackgroundHover: "rgba(127, 179, 255, 0.18)",
    softBackgroundActive: "rgba(127, 179, 255, 0.24)",
    softBackgroundDisabled: "rgba(127, 179, 255, 0.06)",
    softText: accent,
    softTextHover: "#A6CBFF",
    softTextActive: "#C8DEFF",
    softTextDisabled: textSubtle,
    //
    plainBackground: "transparent",
    plainBackgroundHover: accentSoft,
    plainBackgroundActive: "rgba(127, 179, 255, 0.18)",
    plainText: accent,
    plainTextHover: "#A6CBFF",
    plainTextActive: "#C8DEFF",
    plainTextDisabled: textSubtle,
    //
    containedBackground: accentDeep,
    containedBackgroundHover: accentStrong,
    containedBackgroundActive: "#174C95",
    containedText: "#FFFFFF",
    containedTextHover: "#FFFFFF",
    containedTextActive: "#FFFFFF",
    containedTextDisabled: textSubtle,
  },
  breakpoints: {
    xs: "0px",
    sm: "600px",
    md: "900px",
    lg: "1100px",
  },
  radius: {
    sm: "6px",
    md: "10px",
    lg: "14px",
    pill: "999px",
  },
  motion: {
    fast: "150ms",
    med: "220ms",
    ease: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  },
};

export const unit = (amount: number): string => `${amount * 8}px`;
