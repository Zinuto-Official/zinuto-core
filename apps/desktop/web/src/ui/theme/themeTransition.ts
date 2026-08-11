// SPDX-License-Identifier: GPL-3.0-only

import { flushSync } from "react-dom";

type ThemeRevealViewport = {
  height: number;
  width: number;
};

type ThemeRevealGeometry = {
  centerX: number;
  centerY: number;
  radius: number;
};

type ActiveThemeTransition = {
  layer: HTMLElement;
  stop: () => void;
};

const APP_ROOT_SELECTOR = ".app-root";
const SNAPSHOT_ATTRIBUTE = "data-theme-transition-snapshot";
const TRANSITION_ATTRIBUTE = "data-theme-transition";
const DEFAULT_DURATION_MS = 480;
const SNAPSHOT_EDGE_SOFTNESS_PX = 1.5;

let activeThemeTransition: ActiveThemeTransition | null = null;

export const resolveThemeRevealGeometry = ({
  height,
  width,
}: ThemeRevealViewport): ThemeRevealGeometry => {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 0;
  const centerX = safeWidth / 2;
  const centerY = safeHeight / 2;

  return {
    centerX,
    centerY,
    radius: Math.hypot(centerX, centerY) + SNAPSHOT_EDGE_SOFTNESS_PX,
  };
};

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

const supportsSnapshotMask = (): boolean => {
  if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
    return false;
  }

  const mask = "radial-gradient(circle at center, transparent 0, black 1px)";
  return (
    CSS.supports("mask-image", mask) ||
    CSS.supports("-webkit-mask-image", mask)
  );
};

const resolveThemeSignature = (root: HTMLElement): string => {
  const rootTheme = root.classList.contains("theme-dark")
    ? "dark"
    : root.classList.contains("theme-light")
      ? "light"
      : "unknown";

  return `${document.documentElement.getAttribute("data-theme") ?? ""}:${rootTheme}`;
};

const copyCanvasFrame = (
  source: HTMLCanvasElement,
  snapshot: HTMLCanvasElement,
): void => {
  try {
    snapshot.width = source.width;
    snapshot.height = source.height;
    const context = snapshot.getContext("2d");
    context?.drawImage(source, 0, 0);
  } catch {
    // A chart may be backed by a protected or unavailable graphics context.
    // The old DOM structure remains usable even when its bitmap cannot copy.
  }
};

const copyLiveElementState = (
  sourceRoot: HTMLElement,
  snapshotRoot: HTMLElement,
): void => {
  const sourceElements = [
    sourceRoot,
    ...sourceRoot.querySelectorAll<HTMLElement>("*"),
  ];
  const snapshotElements = [
    snapshotRoot,
    ...snapshotRoot.querySelectorAll<HTMLElement>("*"),
  ];

  sourceElements.forEach((source, index) => {
    const snapshot = snapshotElements[index];
    if (!snapshot) {
      return;
    }

    snapshot.scrollTop = source.scrollTop;
    snapshot.scrollLeft = source.scrollLeft;

    if (source instanceof HTMLInputElement && snapshot instanceof HTMLInputElement) {
      snapshot.value = source.value;
      snapshot.checked = source.checked;
      snapshot.indeterminate = source.indeterminate;
      return;
    }

    if (source instanceof HTMLTextAreaElement && snapshot instanceof HTMLTextAreaElement) {
      snapshot.value = source.value;
      return;
    }

    if (source instanceof HTMLSelectElement && snapshot instanceof HTMLSelectElement) {
      snapshot.selectedIndex = source.selectedIndex;
      return;
    }

    if (source instanceof HTMLCanvasElement && snapshot instanceof HTMLCanvasElement) {
      copyCanvasFrame(source, snapshot);
    }
  });
};

const resolveSnapshotBackdropColor = (sourceRoot: HTMLElement): string => {
  let element: HTMLElement | null = sourceRoot;

  while (element) {
    const backgroundColor = window.getComputedStyle(element).backgroundColor;
    if (
      backgroundColor !== "transparent" &&
      !backgroundColor.endsWith(", 0)") &&
      !backgroundColor.endsWith("/ 0)")
    ) {
      return backgroundColor;
    }
    element = element.parentElement;
  }

  return "";
};

const applySnapshotMask = (
  layer: HTMLElement,
  geometry: ThemeRevealGeometry,
  radius: number,
): void => {
  const outerRadius = Math.max(0, radius) + SNAPSHOT_EDGE_SOFTNESS_PX;
  const innerRadius = Math.max(0, radius - SNAPSHOT_EDGE_SOFTNESS_PX);
  const mask = `radial-gradient(circle at ${geometry.centerX}px ${geometry.centerY}px, transparent 0, transparent ${innerRadius}px, black ${outerRadius}px)`;

  layer.style.maskImage = mask;
  layer.style.webkitMaskImage = mask;
  layer.dataset.themeTransitionRadius = String(Math.round(radius));
};

const createThemeSnapshot = (
  sourceRoot: HTMLElement,
  geometry: ThemeRevealGeometry,
): HTMLElement => {
  const layer = document.createElement("div");
  const snapshotRoot = sourceRoot.cloneNode(true) as HTMLElement;
  const backdropColor = resolveSnapshotBackdropColor(sourceRoot);

  layer.setAttribute(SNAPSHOT_ATTRIBUTE, "true");
  layer.setAttribute("aria-hidden", "true");
  layer.inert = true;
  layer.dataset.themeTransitionProgress = "0";
  if (backdropColor) {
    layer.style.backgroundColor = backdropColor;
  }

  try {
    layer.append(snapshotRoot);
    applySnapshotMask(layer, geometry, 0);
    document.body.append(layer);
    copyLiveElementState(sourceRoot, snapshotRoot);
  } catch (error) {
    layer.remove();
    throw error;
  }

  return layer;
};

const easeThemeReveal = (progress: number): number => {
  if (progress <= 0) {
    return 0;
  }
  if (progress >= 1) {
    return 1;
  }
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
};

const releaseThemeSnapshot = (layer: HTMLElement): void => {
  layer.remove();
  document.documentElement.removeAttribute(TRANSITION_ATTRIBUTE);
  if (activeThemeTransition?.layer === layer) {
    activeThemeTransition = null;
  }
};

const animateThemeSnapshot = (
  layer: HTMLElement,
  geometry: ThemeRevealGeometry,
): void => {
  const duration = resolveThemeTransitionDuration();
  let frameId = 0;
  let startedAt: number | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    window.cancelAnimationFrame(frameId);
    releaseThemeSnapshot(layer);
  };

  activeThemeTransition = { layer, stop };
  document.documentElement.setAttribute(TRANSITION_ATTRIBUTE, "active");

  const step = (timestamp: number) => {
    if (stopped) {
      return;
    }

    startedAt ??= timestamp;
    const progress =
      duration === 0 ? 1 : Math.min(1, (timestamp - startedAt) / duration);
    applySnapshotMask(
      layer,
      geometry,
      geometry.radius * easeThemeReveal(progress),
    );
    layer.dataset.themeTransitionProgress = progress.toFixed(3);

    if (progress >= 1) {
      stop();
      return;
    }

    frameId = window.requestAnimationFrame(step);
  };

  frameId = window.requestAnimationFrame(step);
};

const fadeThemeSnapshot = (layer: HTMLElement): void => {
  const duration = Math.min(220, resolveThemeTransitionDuration());
  document.documentElement.setAttribute(TRANSITION_ATTRIBUTE, "active");
  const animation = layer.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration,
    easing: "ease-out",
    fill: "both",
  });
  const stop = () => {
    animation.cancel();
    releaseThemeSnapshot(layer);
  };
  activeThemeTransition = { layer, stop };
  void animation.finished.catch(() => undefined).then(() => {
    if (activeThemeTransition?.layer === layer) {
      releaseThemeSnapshot(layer);
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
    flushSync(commit);
    return;
  }

  activeThemeTransition?.stop();
  const sourceRoot = document.querySelector<HTMLElement>(APP_ROOT_SELECTOR);
  if (!sourceRoot) {
    flushSync(commit);
    return;
  }

  const geometry = resolveThemeRevealGeometry({
    height: document.documentElement.clientHeight || window.innerHeight,
    width: document.documentElement.clientWidth || window.innerWidth,
  });
  const beforeSignature = resolveThemeSignature(sourceRoot);
  let snapshot: HTMLElement | null = null;

  try {
    snapshot = createThemeSnapshot(sourceRoot, geometry);
  } catch {
    flushSync(commit);
    return;
  }

  try {
    flushSync(commit);
  } catch (error) {
    snapshot.remove();
    throw error;
  }

  const nextRoot = document.querySelector<HTMLElement>(APP_ROOT_SELECTOR);
  if (!nextRoot || beforeSignature === resolveThemeSignature(nextRoot)) {
    snapshot.remove();
    return;
  }

  if (supportsSnapshotMask()) {
    animateThemeSnapshot(snapshot, geometry);
  } else {
    fadeThemeSnapshot(snapshot);
  }
};
