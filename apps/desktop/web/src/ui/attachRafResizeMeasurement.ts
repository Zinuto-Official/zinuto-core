// SPDX-License-Identifier: GPL-3.0-only

export const attachRafResizeMeasurement = (element: HTMLElement, measure: () => void): (() => void) => {
  let frameId = 0;
  let disposed = false;

  const scheduleMeasure = () => {
    if (disposed || frameId) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      if (disposed) return;
      measure();
    });
  };

  scheduleMeasure();

  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(element);
  } else {
    window.addEventListener('resize', scheduleMeasure);
  }

  return () => {
    disposed = true;
    if (frameId) {
      window.cancelAnimationFrame(frameId);
    }
    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      window.removeEventListener('resize', scheduleMeasure);
    }
  };
};
