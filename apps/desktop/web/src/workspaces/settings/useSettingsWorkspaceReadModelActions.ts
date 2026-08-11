// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ApiDesktopWorkspaceReadModel } from "@/api";
import {
  readSettingsDevSimulationActionModel,
  readSettingsWorkspaceAction,
} from "@/workspaces/settings/settingsWorkspaceReadModelUi";

export const useSettingsWorkspaceReadModelActions = (isActive: boolean) => {
  const [settingsReadModel, setSettingsReadModel] =
    useState<ApiDesktopWorkspaceReadModel | null>(null);
  const activeRef = useRef(isActive);
  const requestEpochRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  activeRef.current = isActive;

  const refresh = useCallback((options?: { force?: boolean }) => {
    if (!isActive) {
      requestEpochRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      setSettingsReadModel(null);
      return Promise.resolve();
    }
    const requestEpoch = requestEpochRef.current + 1;
    requestEpochRef.current = requestEpoch;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    return api
      .getWorkspaceReadModel("settings", {
        forceRefresh: options?.force === true,
        signal: controller.signal,
      })
      .then((model) => {
        if (activeRef.current && requestEpochRef.current === requestEpoch) {
          setSettingsReadModel(model);
        }
      })
      .catch(() => {
        if (activeRef.current && requestEpochRef.current === requestEpoch) {
          setSettingsReadModel(null);
        }
      })
      .finally(() => {
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
      });
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      requestEpochRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
      setSettingsReadModel(null);
      return;
    }
    void refresh();
    return () => {
      requestEpochRef.current += 1;
      requestControllerRef.current?.abort();
      requestControllerRef.current = null;
    };
  }, [isActive, refresh]);

  return useMemo(
    () => ({
      refresh,
      portableExportAction: readSettingsWorkspaceAction(
        settingsReadModel,
        "portable-export",
      ),
      portableImportAction: readSettingsWorkspaceAction(
        settingsReadModel,
        "portable-import",
      ),
      resetAllDataAction: readSettingsWorkspaceAction(
        settingsReadModel,
        "reset-all-data",
      ),
      retentionActionModel: {
        saveEnabled: readSettingsWorkspaceAction(
          settingsReadModel,
          "retention-save",
        ).enabled,
        previewEnabled: readSettingsWorkspaceAction(
          settingsReadModel,
          "retention-preview",
        ).enabled,
        startEnabled: readSettingsWorkspaceAction(
          settingsReadModel,
          "retention-start",
        ).enabled,
      },
      devSimulationActionModel:
        readSettingsDevSimulationActionModel(settingsReadModel),
    }),
    [refresh, settingsReadModel],
  );
};
