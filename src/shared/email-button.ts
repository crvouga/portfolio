import { CONTENT } from "../content/content";
import type { ViewWithProps } from "../library/html/index";
import { viewButton } from "../ui/button";
import { mail } from "../ui/icons";
import { toCopyToClipboardOnClick } from "./copy-to-clipboard";

type Props = {
  label?: string;
};

export const viewEmailButton: ViewWithProps<Props> = (props) => () => {
  const email = CONTENT.EMAIL_ADDRESS;
  const label = props.label ?? "Email";

  return viewButton({
    tag: "button",
    variant: "contained",
    size: "lg",
    disabled: false,
    startDecorator: mail,
    text: label,
  })({
    type: "button",
    title: "Copy email to clipboard",
    onclick: toCopyToClipboardOnClick(email, "Email copied to clipboard"),
  });
};
