import { type View, tag, text } from "../library/html/index";
import { HEAD } from "../ui/head";
import { viewSectionTitle } from "./section-title/index";

export const viewSection = (props: {
  title: string;
  subtitle?: string;
  number?: string;
}): View => (attr, c) => {
  return tag(
    "section",
    {
      ...attr,
      class: ["section", attr?.["class"]].filter(Boolean).join(" "),
    },
    [viewSectionTitle(props)(), ...(c ?? [])]
  );
};

HEAD.push(
  tag("style", {}, [
    text(`
      .section {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 32px;
        scroll-margin-top: 96px;
      }
    `),
  ])
);
