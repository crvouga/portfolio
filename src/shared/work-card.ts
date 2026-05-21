import { tag } from "../library/html/index";
import type { ViewWithProps } from "../library/html/index";
import type { Work } from "../content/work";
import { viewButton } from "../ui/button";
import { viewCard, viewCardActions, viewCardContent } from "../ui/card";
import { viewDatePill } from "../ui/date-pill";
import { appendExternalLinkIndicator } from "../ui/external-link-indicator";
import { web } from "../ui/icons";
import { viewLink } from "../ui/link";
import { unit } from "../ui/theme";
import { viewTypography } from "../ui/typography";
import { viewWorkCardMedia } from "./work-card/media/index";

export const viewWorkCard: ViewWithProps<{ work: Work; fetchPriority?: "high" | "auto" }> =
  ({ work, fetchPriority }) =>
  () => {
    const mediaProps = fetchPriority
      ? { work, fetchPriority }
      : { work };
    return viewCard({}, [
      viewWorkCardMedia(mediaProps)({}),
      viewCardContent({}, [
        tag(
          "div",
          {
            style: {
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              gap: unit(1.5),
              "margin-bottom": unit(1),
              "flex-wrap": "wrap",
            },
          },
          [
            viewLink(
              {
                href: work.infoUrl ?? " ",
              },
              [
                viewTypography({
                  level: "h3",
                  text: work.infoUrl
                    ? appendExternalLinkIndicator({ text: work.name })
                    : work.name,
                })(),
              ]
            ),
            viewDatePill({
              yearStart: work.yearStart,
              yearEnd: work.yearEnd,
            })(),
          ]
        ),

        viewTypography({
          level: "title-sm",
          text: work.jobTitle,
        })({
          style: { "margin-bottom": unit(1.5) },
        }),

        viewTypography({
          level: "body-md",
          text: work.jobDescription,
        })({
          style: {
            "margin-bottom": unit(2),
          },
        }),

        ...(work.infoUrl
          ? [
              viewCardActions({}, [
                viewButton({
                  tag: "a",
                  startDecorator: web,
                  variant: "soft",
                  disabled: false,
                  text: "Website",
                  size: "sm",
                })({
                  href: work.infoUrl,
                  target: "_blank",
                  rel: "noreferrer noopener",
                }),
              ]),
            ]
          : []),
      ]),
    ]);
  };
