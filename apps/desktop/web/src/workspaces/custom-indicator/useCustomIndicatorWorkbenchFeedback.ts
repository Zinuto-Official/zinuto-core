// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useRef, useState } from "react";
import { reportAppError } from "@/frontend-kernel/errors/appErrorUtils";
import { resolveCustomIndicatorProductMessage } from "@/domains/custom-indicator/indicator/scriptDiagnostics";
import type {
  ConsoleLogEntry,
  ConsoleLogLevel,
} from "@/workspaces/custom-indicator/customIndicatorWorkbenchTypes";

export const useCustomIndicatorWorkbenchFeedback = () => {
  const lastStoragePersistErrorRef = useRef("");
  const [storagePersistError, setStoragePersistError] = useState("");
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);

  const clearStoragePersistFailure = useCallback(() => {
    lastStoragePersistErrorRef.current = "";
    setStoragePersistError("");
  }, []);
  const appendConsoleLog = useCallback(
    (level: ConsoleLogLevel, message: string) => {
      setConsoleLogs((current) => {
        const next = [
          ...current,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
            level,
            message,
            timestamp: Date.now(),
          },
        ];
        return next.length <= 300 ? next : next.slice(next.length - 300);
      });
    },
    [],
  );
  const setStoragePersistFailure = useCallback(
    (
      error: unknown,
      context: "profile-read" | "profile-write" | "profile-save",
      fallback?: string,
    ) => {
      const message = resolveCustomIndicatorProductMessage(error, {
        context,
        fallback,
      });
      setStoragePersistError(message);
      if (lastStoragePersistErrorRef.current !== message) {
        lastStoragePersistErrorRef.current = message;
        reportAppError(message, { fallbackMessage: message });
      }
      return message;
    },
    [],
  );

  return {
    appendConsoleLog,
    clearStoragePersistFailure,
    consoleLogs,
    setStoragePersistFailure,
    storagePersistError,
  };
};
