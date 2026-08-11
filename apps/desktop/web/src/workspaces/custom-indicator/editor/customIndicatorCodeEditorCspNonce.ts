// SPDX-License-Identifier: GPL-3.0-only

export const resolveCustomIndicatorCodeEditorCspNonce = (): string | undefined => {
  if (typeof document === "undefined") {
    return undefined;
  }

  const nonceElement = document.querySelector<
    HTMLScriptElement | HTMLStyleElement
  >("script[nonce], style[nonce]");
  const nonce = nonceElement?.nonce || nonceElement?.getAttribute("nonce") || "";
  return nonce.trim() || undefined;
};
