import { ensureObject } from "../../../library/ensure-object";
import { tag } from "../../../library/html/index";
import { unit } from "../../../ui/theme";
import { viewTypography } from "../../../ui/typography";
import { viewProjectCardContentChips } from "./chips";
import { viewProjectLiveIndicator } from "./live";
import { viewProjectCardContentTitle } from "./title";
import type { ProjectCardView } from "../props";

export const viewProjectCardContentMain: ProjectCardView = (props) => (a, _c) => {
  return tag(
    "div",
    {
      ...a,
      style: {
        ...ensureObject(a?.["style"]),
        flex: 1,
        display: "flex",
        "flex-direction": "column",
      },
    },
    [
      tag(
        "div",
        {
          style: {
            display: "flex",
            "flex-direction": "row",
            "align-items": "flex-start",
            "justify-content": "space-between",
            gap: unit(1.5),
            "margin-bottom": unit(1.5),
            "flex-wrap": "nowrap",
          },
        },
        [
          tag(
            "div",
            {
              style: {
                flex: "1 1 auto",
                "min-width": "0",
                "overflow-wrap": "anywhere",
              },
            },
            [viewProjectCardContentTitle(props)({})]
          ),
          viewProjectLiveIndicator({ deployment: props.project.deployment }),
        ]
      ),
      viewTypography({
        level: "body-md",
        text: props.project.description,
      })({
        style: {
          "margin-bottom": unit(2),
        },
      }),
      viewProjectCardContentChips(props)(),
    ]
  );
};
