// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { attachRafResizeMeasurement } from "@/ui/attachRafResizeMeasurement";

type ActiveSelectionRect = {
  height: number;
  width: number;
  x: number;
  y: number;
};

const areRectsEqual = (
  left: ActiveSelectionRect | null,
  right: ActiveSelectionRect | null,
): boolean => {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    Math.abs(left.x - right.x) < 0.5 &&
    Math.abs(left.y - right.y) < 0.5 &&
    Math.abs(left.width - right.width) < 0.5 &&
    Math.abs(left.height - right.height) < 0.5
  );
};

export const useActiveSelectionRect = <T extends string>({
  activeValue,
}: {
  activeValue: T | null;
}) => {
  const containerRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef(new Map<T, HTMLElement>());
  const itemRefCallbacks = useRef(
    new Map<T, (node: HTMLElement | null) => void>(),
  );
  const activeValueRef = useRef<T | null>(activeValue);
  const [activeRect, setActiveRect] = useState<ActiveSelectionRect | null>(null);
  const scheduledFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  activeValueRef.current = activeValue;

  const measure = useCallback(() => {
    const container = containerRef.current;
    const activeElement = activeValue
      ? itemRefs.current.get(activeValue) ?? null
      : null;
    if (!activeValue) {
      setActiveRect((current) => (current === null ? current : null));
      return;
    }
    if (!container || !activeElement) {
      return;
    }
    const containerBounds = container.getBoundingClientRect();
    const activeBounds = activeElement.getBoundingClientRect();
    const nextRect = {
      // Absolutely positioned indicators use the container's padding box as
      // their origin, whereas getBoundingClientRect() includes its border.
      // Remove that border offset so the outline follows the active control
      // exactly instead of being shifted down and right.
      x:
        activeBounds.left -
        containerBounds.left +
        container.scrollLeft -
        container.clientLeft,
      y:
        activeBounds.top -
        containerBounds.top +
        container.scrollTop -
        container.clientTop,
      width: activeBounds.width,
      height: activeBounds.height,
    };
    setActiveRect((current) => (areRectsEqual(current, nextRect) ? current : nextRect));
  }, [activeValue]);

  const cancelScheduledMeasure = useCallback(() => {
    if (scheduledFrameRef.current === null) {
      return;
    }
    window.cancelAnimationFrame(scheduledFrameRef.current);
    scheduledFrameRef.current = null;
  }, []);

  const scheduleMeasure = useCallback(() => {
    cancelScheduledMeasure();
    scheduledFrameRef.current = window.requestAnimationFrame(() => {
      scheduledFrameRef.current = null;
      if (!mountedRef.current) {
        return;
      }
      measure();
    });
  }, [cancelScheduledMeasure, measure]);

  const setContainerNode = useCallback(
    (node: HTMLElement | null) => {
      containerRef.current = node;
      scheduleMeasure();
    },
    [scheduleMeasure],
  );

  const registerItem = useCallback(
    (value: T) => {
      const cachedCallback = itemRefCallbacks.current.get(value);
      if (cachedCallback) {
        return cachedCallback;
      }
      const callback = (node: HTMLElement | null) => {
        const currentNode = itemRefs.current.get(value) ?? null;
        if (currentNode === node) {
          return;
        }
        if (node) {
          itemRefs.current.set(value, node);
        } else {
          itemRefs.current.delete(value);
        }
        if (value === activeValueRef.current) {
          scheduleMeasure();
        }
      };
      itemRefCallbacks.current.set(value, callback);
      return callback;
    },
    [scheduleMeasure],
  );

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelScheduledMeasure();
    };
  }, [cancelScheduledMeasure]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const activeElement = activeValue
      ? itemRefs.current.get(activeValue) ?? null
      : null;
    if (!activeValue) {
      setActiveRect((current) => (current === null ? current : null));
      return;
    }
    if (!container || !activeElement) {
      return;
    }
    measure();
    const detachContainer = attachRafResizeMeasurement(container, measure);
    const detachActiveElement =
      activeElement === container
        ? () => {}
        : attachRafResizeMeasurement(activeElement, measure);
    return () => {
      detachActiveElement();
      detachContainer();
    };
  }, [activeValue, measure]);

  return {
    activeRect,
    registerItem,
    setContainerNode,
  };
};
