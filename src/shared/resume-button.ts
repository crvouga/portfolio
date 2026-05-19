import { RESUME_FILENAME } from "../constants/resume";
import { text } from "../library/html/index";
import type { View, ViewWithProps } from "../library/html/index";
import { renderAttrs } from "../library/html/render";
import { viewButton } from "../ui/button";

const download: View = (attrs, _) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>`;
  return text(svg.replace("<svg ", `<svg ${renderAttrs(attrs ?? {})} `));
};

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
