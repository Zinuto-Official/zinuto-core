// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { api } from "@/api";
import type { DataConfigDetailWindowTabId } from "@/workspaces/data/DataConfigDetailDrawer";
import type { PoolSettingsRow } from "@/workspaces/data/dataConfig/model";

type UseDataConfigDetailActionsInput = {
  detailWindowRevisionRef: MutableRefObject<number>;
  poolSettingsRows: PoolSettingsRow[];
  setActiveSymbol: Dispatch<SetStateAction<string>>;
  setCheckedSymbols: Dispatch<SetStateAction<string[]>>;
  setDetailOperationErrorText: Dispatch<SetStateAction<string>>;
  setDetailPoolId: Dispatch<SetStateAction<string>>;
  setDetailSymbolKeyword: Dispatch<SetStateAction<string>>;
  setDetailWindowTab: Dispatch<SetStateAction<DataConfigDetailWindowTabId>>;
};

export const useDataConfigDetailActions = ({
  detailWindowRevisionRef,
  poolSettingsRows,
  setActiveSymbol,
  setCheckedSymbols,
  setDetailOperationErrorText,
  setDetailPoolId,
  setDetailSymbolKeyword,
  setDetailWindowTab,
}: UseDataConfigDetailActionsInput) => {
  const openDetailPool = useCallback(
    (poolId: string) => {
      const target = poolSettingsRows.find((pool) => pool.id === poolId);
      if (!target || target.status !== "READY") {
        return;
      }
      setDetailPoolId(poolId);
      setDetailOperationErrorText("");
      setDetailWindowTab("OVERVIEW");
      setDetailSymbolKeyword("");
      setCheckedSymbols([]);
      const firstSymbol = target.symbols[0] ?? "";
      setActiveSymbol(firstSymbol);
      void api
        .openDesktopSecondaryWindow({
          kind: "DATA_CONFIG_DETAIL",
          title: target.name,
          payload: null,
        })
        .then((state) => {
          detailWindowRevisionRef.current = state.revision;
        })
        .catch(() => {
          detailWindowRevisionRef.current = 0;
          setDetailPoolId("");
        });
    },
    [
      detailWindowRevisionRef,
      poolSettingsRows,
      setActiveSymbol,
      setCheckedSymbols,
      setDetailOperationErrorText,
      setDetailPoolId,
      setDetailSymbolKeyword,
      setDetailWindowTab,
    ],
  );

  return {
    openDetailPool,
  };
};
