import { tag } from "../../library/html/index";
import type { ViewWithProps } from "../../library/html/index";
import type { School } from "../../content/school";
import { viewCard, viewCardContent } from "../../ui/card";
import { viewDatePill } from "../../ui/date-pill";
import { appendExternalLinkIndicator } from "../../ui/external-link-indicator";
import { viewLink } from "../../ui/link";
import { unit } from "../../ui/theme";
import { viewTypography } from "../../ui/typography";
import { viewSchoolCardImage } from "./image";

export const viewSchoolCard: ViewWithProps<{ school: School }> =
  ({ school }) =>
  () => {
    return viewCard({}, [
      viewSchoolCardImage({ school })(),
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
                href: school.infoUrl ?? " ",
              },
              [
                viewTypography({
                  level: "h3",
                  text: school.infoUrl
                    ? appendExternalLinkIndicator({ text: school.institutionName })
                    : school.institutionName,
                })(),
              ]
            ),
            viewDatePill({
              yearStart: school.yearStart,
              yearEnd: school.yearEnd,
            })(),
          ]
        ),

        viewTypography({
          level: "title-sm",
          text: school.degree,
        })(),
      ]),
    ]);
  };
