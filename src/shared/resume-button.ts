import { RESUME_FILENAME } from "../constants/resume";
import { viewButton } from "../ui/button";
import { download } from "../ui/icons";
import type { ViewWithProps } from "../library/html/index";

export const viewResumeButton: ViewWithProps<{}> = () => () => {
  return viewButton({
    tag: "a",
    variant: "soft",
    size: "lg",
    disabled: false,
    startDecorator: download,
    text: "Resume",
  })({
    href: `/${RESUME_FILENAME}`,
    download: RESUME_FILENAME,
    target: "_blank",
    rel: "noreferrer noopener",
  });
};
