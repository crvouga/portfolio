import { tag, text } from "../../library/html/index";
import type { ViewWithProps } from "../../library/html/index";
import { HEAD } from "../../ui/head";

export const viewSectionNumber: ViewWithProps<{ number: string }> = (props) => () => {
  return tag("span", { class: "section-num" }, [text(props.number)]);
};

HEAD.push(
  tag("style", {}, [
    text(`
      .section-num {
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: 1;
        letter-spacing: 0.06em;
        color: var(--accent);
        flex-shrink: 0;
      }
    `),
  ])
);
