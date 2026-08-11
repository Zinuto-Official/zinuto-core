// SPDX-License-Identifier: GPL-3.0-only

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { api, type ApiDesktopWorkspaceReadModel } from "@/api";
import type { PoolSettingsRow } from "@/workspaces/data/dataConfig/model";
import { readDataSourceStatusFactsFromReadModel } from "@/workspaces/data/dataConfig/dataConfigWorkspaceReadModelUi";
import type { DataConfigDetailWindowTabId } from "@/workspaces/data/DataConfigDetailDrawer";

type UseDataConfigSourceStateInput = {
  detailWindowRevisionRef: MutableRefObject<number>;
  isActive?: boolean;
  poolSettingsRows: PoolSettingsRow[];
  portableRebindTargetSourceIds: string[];
  setDetailOperationErrorText: Dispatch<SetStateAction<string>>;
  setDetailPoolId: Dispatch<SetStateAction<string>>;
  setDetailWindowTab: Dispatch<SetStateAction<DataConfigDetailWindowTabId>>;
};

export const useDataConfigSourceState = ({
  detailWindowRevisionRef,
  isActive,
  poolSettingsRows,
  portableRebindTargetSourceIds,
  setDetailOperationErrorText,
  setDetailPoolId,
  setDetailWindowTab,
}: UseDataConfigSourceStateInput) => {
  const [dataManagementReadModel, setDataManagementReadModel] =
    useState<ApiDesktopWorkspaceReadModel | null>(null);
  const dataManagementReadModelRefreshSignature = useMemo(
    () =>
      poolSettingsRows
        .map((pool) => [pool.id, pool.status, pool.symbolCount].join(":"))
        .join("|"),
    [poolSettingsRows],
  );

  useEffect(() => {
    if (!isActive) return;
    let canceled = false;
    void api
      .getWorkspaceReadModel("data-management")
      .then((model) => {
        if (!canceled) setDataManagementReadModel(model);
      })
      .catch(() => {
        if (!canceled) setDataManagementReadModel(null);
      });
    return () => {
      canceled = true;
    };
  }, [dataManagementReadModelRefreshSignature, isActive]);

  const readModelSourceStatusById = useMemo(
    () => readDataSourceStatusFactsFromReadModel(dataManagementReadModel),
    [dataManagementReadModel],
  );
  const rebindTargetSourceIdSet = useMemo(
    () =>
      new Set(
        portableRebindTargetSourceIds
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    [portableRebindTargetSourceIds],
  );
  const rebindRequiredPools = useMemo(
    () => poolSettingsRows.filter((pool) => pool.requiresSourceFolderRebind),
    [poolSettingsRows],
  );
  const focusedRebindPools = useMemo(
    () =>
      rebindRequiredPools.filter((pool) =>
        rebindTargetSourceIdSet.has(String(pool.id || "").trim()),
      ),
    [rebindRequiredPools, rebindTargetSourceIdSet],
  );
  const prioritizedRebindPools = useMemo(
    () => (focusedRebindPools.length > 0 ? focusedRebindPools : rebindRequiredPools),
    [focusedRebindPools, rebindRequiredPools],
  );

  useEffect(() => {
    const nextPool = focusedRebindPools[0] ?? null;
    if (!nextPool) return;
    setDetailPoolId((current) => current || nextPool.id);
    setDetailOperationErrorText("");
    setDetailWindowTab("OVERVIEW");
    void api
      .openDesktopSecondaryWindow({
        kind: "DATA_CONFIG_DETAIL",
        title: nextPool.name,
        payload: null,
      })
      .then((state) => {
        detailWindowRevisionRef.current = state.revision;
      })
      .catch(() => {
        detailWindowRevisionRef.current = 0;
        setDetailPoolId("");
      });
  }, [
    detailWindowRevisionRef,
    focusedRebindPools,
    setDetailOperationErrorText,
    setDetailPoolId,
    setDetailWindowTab,
  ]);

  return {
    prioritizedRebindPools,
    readModelSourceStatusById,
  };
};
