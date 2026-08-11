// SPDX-License-Identifier: GPL-3.0-only

import { useEffect } from "react";

export const useCustomIndicatorWorkbenchShortcuts = ({
  isActive,
  runScript,
  saveIndicator,
}: {
  isActive: boolean;
  runScript: () => Promise<void>;
  saveIndicator: () => Promise<void>;
}) => {
  useEffect(() => {
    if (!isActive) {
      return;
    }
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const isPrimaryShortcut = event.metaKey || event.ctrlKey;
      if (!isPrimaryShortcut || event.altKey || event.shiftKey) {
        return;
      }
      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === "s") {
        event.preventDefault();
        void saveIndicator();
      } else if (normalizedKey === "r") {
        event.preventDefault();
        void runScript();
      }
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [isActive, runScript, saveIndicator]);
};
