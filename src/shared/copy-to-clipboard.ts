export const toCopyToClipboardOnClick = (value: string, toastMessage: string): string => {
  return `navigator.clipboard.writeText(${JSON.stringify(value)});document.getElementById('toaster').showToast(${JSON.stringify(toastMessage)})`;
};
