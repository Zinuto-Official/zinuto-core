// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import test from "node:test";

import {
  attachStableElementResizeObserver,
  isElementRenderable,
  type StableElementResize,
  whenElementRenderable,
} from "../../src/domains/chart/chartStableResize";

type MockWindow = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (id: number) => void;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  getComputedStyle: (element: Element) => CSSStyleDeclaration;
};

type MockResizeObserverInstance = {
  observe: (element: Element) => void;
  disconnect: () => void;
  trigger: () => void;
};

const withMockBrowserRuntime = (
  run: (runtime: {
    flushAnimationFrames: (frameCount?: number) => void;
    dispatchWindowResize: () => void;
    observers: MockResizeObserverInstance[];
  }) => void,
) => {
  const globalTarget = globalThis as Record<string, unknown>;
  const previousWindow = globalTarget.window;
  const previousResizeObserver = globalTarget.ResizeObserver;
  let nextFrameId = 1;
  const animationFrames = new Map<number, FrameRequestCallback>();
  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const observers: MockResizeObserverInstance[] = [];

  const mockWindow: MockWindow = {
    requestAnimationFrame: (callback) => {
      const id = nextFrameId;
      nextFrameId += 1;
      animationFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => {
      animationFrames.delete(id);
    },
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener);
    },
    getComputedStyle: (element) => ({
      visibility: (element as { visibility?: string }).visibility ?? "visible",
      display: (element as { display?: string }).display ?? "block",
    }) as CSSStyleDeclaration,
  };

  class MockResizeObserver {
    private readonly callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      observers.push({
        observe: () => undefined,
        disconnect: () => undefined,
        trigger: () => {
          this.callback([], this as unknown as ResizeObserver);
        },
      });
    }

    observe() {
      return undefined;
    }

    disconnect() {
      return undefined;
    }
  }

  globalTarget.window = mockWindow;
  globalTarget.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

  try {
    run({
      observers,
      dispatchWindowResize: () => {
        listeners.get("resize")?.forEach((listener) => {
          const event = { type: "resize" } as Event;
          if (typeof listener === "function") {
            listener(event);
            return;
          }
          listener.handleEvent(event);
        });
      },
      flushAnimationFrames: (frameCount = 1) => {
        for (let frame = 0; frame < frameCount; frame += 1) {
          const pending = [...animationFrames.entries()];
          animationFrames.clear();
          pending.forEach(([id, callback]) => {
            if (!animationFrames.has(id)) {
              callback(0);
            }
          });
        }
      },
    });
  } finally {
    globalTarget.window = previousWindow;
    globalTarget.ResizeObserver = previousResizeObserver;
  }
};

test("stable chart resize observer dedupes same-size events and supports force", () => {
  withMockBrowserRuntime(({ flushAnimationFrames, dispatchWindowResize, observers }) => {
    let width = 320.2;
    let height = 180.4;
    const element = {
      clientWidth: 320,
      clientHeight: 180,
      getBoundingClientRect: () => ({
        width,
        height,
      }),
    } as unknown as HTMLElement;
    const sizes: StableElementResize[] = [];

    const handle = attachStableElementResizeObserver(element, (size) => {
      sizes.push(size);
    });

    observers[0]?.trigger();
    dispatchWindowResize();
    flushAnimationFrames();
    assert.deepEqual(sizes, [{ width: 320, height: 180 }]);

    observers[0]?.trigger();
    dispatchWindowResize();
    flushAnimationFrames();
    assert.equal(sizes.length, 1);

    width = 321.6;
    height = 181.2;
    observers[0]?.trigger();
    flushAnimationFrames();
    assert.deepEqual(sizes[1], { width: 322, height: 181 });

    handle.force();
    flushAnimationFrames();
    assert.deepEqual(sizes[2], { width: 322, height: 181 });

    handle.disconnect();
    width = 340;
    observers[0]?.trigger();
    dispatchWindowResize();
    flushAnimationFrames();
    assert.equal(sizes.length, 3);
  });
});

test("chart renderability helper waits for visible nonzero geometry", () => {
  withMockBrowserRuntime(({ flushAnimationFrames }) => {
    let width = 0;
    const height = 180;
    const element = {
      visibility: "hidden",
      display: "block",
      getBoundingClientRect: () => ({
        width,
        height,
      }),
    } as unknown as HTMLElement & {
      visibility: string;
      display: string;
    };
    let initCount = 0;
    let cleanupCount = 0;

    assert.equal(isElementRenderable(element), false);
    const cleanup = whenElementRenderable(element, () => {
      initCount += 1;
      return () => {
        cleanupCount += 1;
      };
    });

    flushAnimationFrames(5);
    assert.equal(initCount, 0);

    width = 320;
    flushAnimationFrames(2);
    assert.equal(initCount, 0);

    element.visibility = "visible";
    assert.equal(isElementRenderable(element), true);
    flushAnimationFrames();
    assert.equal(initCount, 0);
    flushAnimationFrames();
    assert.equal(initCount, 1);

    flushAnimationFrames(3);
    assert.equal(initCount, 1);
    cleanup();
    assert.equal(cleanupCount, 1);
  });
});

test("chart renderability helper can be cancelled before initialization", () => {
  withMockBrowserRuntime(({ flushAnimationFrames }) => {
    const element = {
      visibility: "visible",
      display: "block",
      getBoundingClientRect: () => ({
        width: 320,
        height: 180,
      }),
    } as unknown as HTMLElement;
    let initCount = 0;

    const cleanup = whenElementRenderable(element, () => {
      initCount += 1;
    });
    cleanup();
    flushAnimationFrames(3);

    assert.equal(initCount, 0);
  });
});

test("chart renderability helper runs inner cleanup after initialization", () => {
  withMockBrowserRuntime(({ flushAnimationFrames }) => {
    const element = {
      visibility: "visible",
      display: "block",
      getBoundingClientRect: () => ({
        width: 320,
        height: 180,
      }),
    } as unknown as HTMLElement;
    let initCount = 0;
    let cleanupCount = 0;

    const cleanup = whenElementRenderable(element, () => {
      initCount += 1;
      return () => {
        cleanupCount += 1;
      };
    });
    flushAnimationFrames(2);
    assert.equal(initCount, 1);

    cleanup();
    cleanup();
    assert.equal(cleanupCount, 1);
  });
});

test("chart renderability helper does not initialize while hidden beyond the old fallback window", () => {
  withMockBrowserRuntime(({ flushAnimationFrames }) => {
    const element = {
      visibility: "hidden",
      display: "block",
      getBoundingClientRect: () => ({
        width: 320,
        height: 180,
      }),
    } as unknown as HTMLElement & {
      visibility: string;
    };
    let initCount = 0;

    const cleanup = whenElementRenderable(element, () => {
      initCount += 1;
    });
    flushAnimationFrames(60);
    assert.equal(initCount, 0);

    flushAnimationFrames(30);
    assert.equal(initCount, 0);

    element.visibility = "visible";
    flushAnimationFrames();
    assert.equal(initCount, 0);
    flushAnimationFrames();
    assert.equal(initCount, 1);

    cleanup();
  });
});
