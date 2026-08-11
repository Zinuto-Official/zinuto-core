// SPDX-License-Identifier: GPL-3.0-only

import { useCallback } from "react";
import {
  isActiveLocalDataImportCard,
  isLocalDataImportSourceBusy,
  normalizeImportSourceId,
} from "@/domains/data-import/importActivity";
import type {
  HallSectionItem,
  PoolSettingsRow,
} from "@/workspaces/data/dataConfig/model";

type UseDataConfigOperationBlockersInput = {
  activeImportSourceIds: Set<string>;
  isGlobalOperationBlocked: boolean;
  poolSettingsById: Map<string, PoolSettingsRow>;
  savingTradingCalendarSourceId: string;
};

export const useDataConfigOperationBlockers = ({
  activeImportSourceIds,
  isGlobalOperationBlocked,
  poolSettingsById,
  savingTradingCalendarSourceId,
}: UseDataConfigOperationBlockersInput) => {
  const isSourceOperationBlocked = useCallback(
    (sourceIdRaw: unknown) => {
      const sourceId = normalizeImportSourceId(sourceIdRaw);
      if (!sourceId) {
        return isGlobalOperationBlocked;
      }
      return (
        isGlobalOperationBlocked ||
        sourceId === savingTradingCalendarSourceId ||
        isLocalDataImportSourceBusy(
          sourceId,
          activeImportSourceIds,
          poolSettingsById.get(sourceId),
        )
      );
    },
    [
      activeImportSourceIds,
      isGlobalOperationBlocked,
      poolSettingsById,
      savingTradingCalendarSourceId,
    ],
  );

  const isItemOperationBlocked = useCallback(
    (item: HallSectionItem) => {
      if (item.type === "READY") {
        return isSourceOperationBlocked(item.pool.id);
      }
      const sourceId = normalizeImportSourceId(item.card.sourceId);
      return (
        isGlobalOperationBlocked ||
        isActiveLocalDataImportCard(item.card) ||
        isLocalDataImportSourceBusy(
          sourceId,
          activeImportSourceIds,
          item.bridgedReadyPool ?? poolSettingsById.get(sourceId),
        )
      );
    },
    [
      activeImportSourceIds,
      isGlobalOperationBlocked,
      isSourceOperationBlocked,
      poolSettingsById,
    ],
  );

  return {
    isItemOperationBlocked,
    isSourceOperationBlocked,
  };
};
