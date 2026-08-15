// SPDX-License-Identifier: GPL-3.0-only

type ActiveThemeTransition = {
  layer: HTMLElement;
  stop: () => void;
};

const APP_ROOT_SELECTOR = ".app-root";
const OVERLAY_ATTRIBUTE = "data-theme-transition-overlay";
const TRANSITION_ATTRIBUTE = "data-theme-transition";
const DEFAULT_DURATION_MS = 480;
const SIGNATURE_WAIT_FRAME_LIMIT = 8;

let activeThemeTransition: ActiveThemeTransition | null = null;
let overlayLayer: HTMLElement | null = null;

export const parseThemeTransitionDuration = (value: string): number | null => {
  const match = /^\s*((?:\d+(?:\.\d+)?)|(?:\.\d+))\s*(ms|s)\s*$/iu.exec(value);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) {
    return null;
  }

  return match[2] === "s" ? amount * 1000 : amount;
};

const resolveThemeTransitionDuration = (): number => {
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--motion-theme-reveal-duration");
  const parsed = parseThemeTransitionDuration(value);

  return Math.min(1200, Math.max(0, parsed ?? DEFAULT_DURATION_MS));
};

const isThemeMotionReduced = (): boolean =>
  document.documentElement.dataset.motion === "reduced" ||
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

const resolveThemeSignature = (root: HTMLElement): string => {
  const rootTheme = root.classList.contains("theme-dark")
    ? "dark"
    : root.classList.contains("theme-light")
      ? "light"
      : "unknown";

  return `${document.documentElement.getAttribute("data-theme") ?? ""}:${rootTheme}`;
};

const ensureThemeTransitionOverlay = (): HTMLElement => {
  if (overlayLayer && overlayLayer.isConnected) {
    return overlayLayer;
  }
  const layer = document.createElement("div");
  layer.setAttribute(OVERLAY_ATTRIBUTE, "true");
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  document.body.append(layer);
  overlayLayer = layer;
  return layer;
};

const releaseThemeTransitionOverlay = (layer: HTMLElement): void => {
  if (overlayLayer === layer) {
    layer.remove();
    overlayLayer = null;
  }
  document.documentElement.removeAttribute(TRANSITION_ATTRIBUTE);
  if (activeThemeTransition?.layer === layer) {
    activeThemeTransition = null;
  }
};

const fadeThemeTransitionOverlay = (layer: HTMLElement): void => {
  const duration = resolveThemeTransitionDuration();
  document.documentElement.setAttribute(TRANSITION_ATTRIBUTE, "active");
  const animation = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration,
    easing: "ease-out",
    fill: "both",
  });
  const stop = () => {
    animation.cancel();
    releaseThemeTransitionOverlay(layer);
  };
  activeThemeTransition = { layer, stop };
  void animation.finished.catch(() => undefined).then(() => {
    if (activeThemeTransition?.layer === layer) {
      releaseThemeTransitionOverlay(layer);
    }
  });
};

export const commitThemeChangeWithTransition = (commit: () => void): void => {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !document.body ||
    isThemeMotionReduced()
  ) {
    commit();
    return;
  }

  activeThemeTransition?.stop();
  const sourceRoot = document.querySelector<HTMLElement>(APP_ROOT_SELECTOR);
  if (!sourceRoot) {
    commit();
    return;
  }

  const beforeSignature = resolveThemeSignature(sourceRoot);
  const layer = ensureThemeTransitionOverlay();
  layer.style.opacity = "1";
  commit();

  // The theme commit renders asynchronously. Cover the app with an opaque
  // overlay, wait for the theme signature to change, then fade the overlay
  // out. A bounded frame budget releases the overlay without a fade when the
  // commit turns out to be a no-op (same mode selected again).
  let waitedFrames = 0;
  const waitForAppliedTheme = () => {
    waitedFrames += 1;
    const currentRoot = document.querySelector<HTMLElement>(APP_ROOT_SELECTOR);
    if (
      (currentRoot && beforeSignature !== resolveThemeSignature(currentRoot)) ||
      waitedFrames >= SIGNATURE_WAIT_FRAME_LIMIT
    ) {
      if (currentRoot && beforeSignature !== resolveThemeSignature(currentRoot)) {
        fadeThemeTransitionOverlay(layer);
      } else {
        releaseThemeTransitionOverlay(layer);
      }
      return;
    }
    window.requestAnimationFrame(waitForAppliedTheme);
  };
  window.requestAnimationFrame(waitForAppliedTheme);
};
