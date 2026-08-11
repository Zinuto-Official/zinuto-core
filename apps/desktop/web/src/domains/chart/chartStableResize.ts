// SPDX-License-Identifier: GPL-3.0-only

export type StableElementResize = {
  width: number;
  height: number;
};

export type StableElementResizeObserverHandle = {
  force: () => void;
  disconnect: () => void;
};

export type ElementRenderableCleanup = () => void;

export type WhenElementRenderableOptions = {
  stableFrames?: number;
};

const readStableElementResize = (element: HTMLElement): StableElementResize => {
  const rect = element.getBoundingClientRect?.();
  const rectWidth = Number(rect?.width);
  const rectHeight = Number(rect?.height);
  const width = Number.isFinite(rectWidth) && rectWidth > 0 ? rectWidth : element.clientWidth;
  const height = Number.isFinite(rectHeight) && rectHeight > 0 ? rectHeight : element.clientHeight;
  return {
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
  };
};

export const isElementRenderable = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && style.display !== 'none';
};

export const whenElementRenderable = (
  element: HTMLElement,
  callback: () => void | ElementRenderableCleanup,
  options: WhenElementRenderableOptions = {},
): ElementRenderableCleanup => {
  const requiredStableFrames = Math.max(1, Math.floor(options.stableFrames ?? 2));
  let rafId = 0;
  let disconnected = false;
  let hasRun = false;
  let stableRenderableFrames = 0;
  let callbackCleanup: ElementRenderableCleanup | null = null;

  const runCallback = () => {
    if (hasRun || disconnected) {
      return;
    }
    hasRun = true;
    callbackCleanup = callback() ?? null;
  };

  const check = () => {
    rafId = 0;
    if (disconnected || hasRun) {
      return;
    }
    stableRenderableFrames = isElementRenderable(element) ? stableRenderableFrames + 1 : 0;
    if (stableRenderableFrames >= requiredStableFrames) {
      runCallback();
      return;
    }
    rafId = window.requestAnimationFrame(check);
  };

  rafId = window.requestAnimationFrame(check);

  return () => {
    disconnected = true;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
    callbackCleanup?.();
    callbackCleanup = null;
  };
};

export const attachStableElementResizeObserver = (
  element: HTMLElement,
  onResize: (size: StableElementResize) => void,
): StableElementResizeObserverHandle => {
  let rafId = 0;
  let disconnected = false;
  let pendingForce = false;
  let lastWidth = -1;
  let lastHeight = -1;

  const schedule = (force = false) => {
    pendingForce = pendingForce || force;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
    rafId = window.requestAnimationFrame(() => {
      rafId = 0;
      if (disconnected) {
        return;
      }
      const size = readStableElementResize(element);
      const sizeChanged = size.width !== lastWidth || size.height !== lastHeight;
      const shouldRun = pendingForce || sizeChanged;
      pendingForce = false;
      if (!shouldRun) {
        return;
      }
      lastWidth = size.width;
      lastHeight = size.height;
      onResize(size);
    });
  };

  const handleWindowResize = () => schedule();
  window.addEventListener('resize', handleWindowResize);

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => schedule());
    observer.observe(element);
  }

  schedule();
  return {
    force: () => schedule(true),
    disconnect: () => {
      disconnected = true;
      window.removeEventListener('resize', handleWindowResize);
      if (observer) {
        observer.disconnect();
      }
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    },
  };
};
