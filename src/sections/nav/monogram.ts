import { CONTENT } from "../../content/content";
import { tag } from "../../library/html/index";
import type { View } from "../../library/html/index";
import { viewMonogram } from "../../ui/monogram";

export const viewNavMonogram: View = () => {
  return tag("a", { href: "#top", class: "nav-monogram-link", "aria-label": "Back to top" }, [
    viewMonogram({ initials: CONTENT.MONOGRAM_INITIALS, size: "sm" })(),
  ]);
};
