// SPDX-License-Identifier: GPL-3.0-only

const FALLBACK_LAYOUT_MOTION_DURATION_MS = 200;
const FALLBACK_LAYOUT_MOTION_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";

const parseCssDurationMs = (rawValue: string): number | null => {
  const normalized = rawValue.trim();
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/^(-?\d*\.?\d+)(ms|s)$/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    return null;
  }
  return match[2] === "s" ? value * 1000 : value;
};

const readRootMotionToken = (element: Element, tokenName: string): string => {
  const root = element.ownerDocument.documentElement;
  const view = element.ownerDocument.defaultView;
  if (!view) {
    return "";
  }
  return view.getComputedStyle(root).getPropertyValue(tokenName).trim();
};

export const resolveLayoutMotionAnimationOptions = (
  element: Element,
): KeyframeAnimationOptions => ({
  duration:
    parseCssDurationMs(readRootMotionToken(element, "--motion-duration-base")) ??
    FALLBACK_LAYOUT_MOTION_DURATION_MS,
  easing:
    readRootMotionToken(element, "--motion-ease-standard") ||
    FALLBACK_LAYOUT_MOTION_EASING,
});
