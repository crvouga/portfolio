import { tag, text } from "../../library/html/index";
import type { Html, ViewWithProps } from "../../library/html/index";
import { HEAD } from "../../ui/head";
import { viewTypography } from "../../ui/typography";
import { viewSectionNumber } from "./number";
import { viewSectionRule } from "./rule";

type Props = {
  title: string;
  subtitle?: string;
  number?: string;
};

export const viewSectionTitle: ViewWithProps<Props> = (p) => () => {
  const titleRow: Html[] = [];
  if (p.number) {
    titleRow.push(viewSectionNumber({ number: p.number })());
  }
  titleRow.push(viewTypography({ level: "h2", text: p.title })({ class: "section-title-h" }));
  titleRow.push(viewSectionRule());

  return tag("div", { class: "section-title" }, [
    tag("div", { class: "section-title-row" }, titleRow),
    ...(p.subtitle
      ? [
          viewTypography({ level: "body-md", text: p.subtitle })({
            class: "section-title-sub",
          }),
        ]
      : []),
  ]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .section-title {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .section-title-row {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .section-title-h {
        flex-shrink: 0;
      }
      .section-title-sub {
        max-width: 720px;
      }
    `),
  ])
);
