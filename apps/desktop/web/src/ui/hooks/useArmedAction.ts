// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEventHandler,
} from "react";

export const useArmedAction = <T extends string>() => {
  const [armedKey, setArmedKey] = useState<T | "">("");
  const blurClearTimerRef = useRef<number | null>(null);

  const cancelPendingBlurClear = useCallback(() => {
    if (blurClearTimerRef.current === null) {
      return;
    }
    window.clearTimeout(blurClearTimerRef.current);
    blurClearTimerRef.current = null;
  }, []);

  const clearArmedAction = useCallback(() => {
    cancelPendingBlurClear();
    setArmedKey("");
  }, [cancelPendingBlurClear]);

  const armAction = useCallback((key: T) => {
    cancelPendingBlurClear();
    setArmedKey(key);
  }, [cancelPendingBlurClear]);

  const isActionArmed = useCallback(
    (key: T) => armedKey === key,
    [armedKey],
  );

  const buildBlurClearHandler = useCallback(
    (key: T): FocusEventHandler<HTMLElement> =>
      (event) => {
        const currentTarget = event.currentTarget;
        const nextFocused = event.relatedTarget;
        if (nextFocused && currentTarget.contains(nextFocused)) {
          return;
        }
        if (armedKey !== key) {
          return;
        }
        cancelPendingBlurClear();
        blurClearTimerRef.current = window.setTimeout(() => {
          blurClearTimerRef.current = null;
          const activeElement = currentTarget.ownerDocument.activeElement;
          if (activeElement && currentTarget.contains(activeElement)) {
            return;
          }
          setArmedKey((current) => (current === key ? "" : current));
        }, 0);
      },
    [armedKey, cancelPendingBlurClear],
  );

  useEffect(() => {
    if (!armedKey) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      setArmedKey("");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [armedKey]);

  useEffect(
    () => () => {
      cancelPendingBlurClear();
    },
    [cancelPendingBlurClear],
  );

  return {
    armedKey,
    setArmedKey,
    clearArmedAction,
    armAction,
    isActionArmed,
    buildBlurClearHandler,
  };
};
