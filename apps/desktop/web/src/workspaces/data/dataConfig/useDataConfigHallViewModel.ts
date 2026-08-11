// SPDX-License-Identifier: GPL-3.0-only

import type { DataSourceSyncMonitorStateById, DataSourceSyncPrefsById } from "@/domains/data-import/dataSourceTypes";
import { useCallback, useMemo } from "react";
import {
  type PoolSettingsRow,
} from "@/workspaces/data/dataConfig/model";
import { buildHallSectionsWithDragPreview } from "@/workspaces/data/dataConfig/useDataConfigCardReorder";
import { buildHallSections } from "@/workspaces/data/dataConfig/hallSectionsBuilder";
import {
  resolveHallSummaryStatus,
  type DataConfigCopy,
  type DataConfigReadModelSourceStatus,
  type SummaryFilterResolvedStatus,
} from "@/workspaces/data/dataConfig/hallStatusReadModelAdapter";
import type { BaseTimeframe } from "@/domains/chart/chartPeriods";
import type {
  CsvImportCardView,
  HallSectionItem,
} from "@/workspaces/data/dataConfig/model";

type UseDataConfigHallViewModelParams = {
  baseTimeframeLabels: Record<BaseTimeframe, string>;
  csvImportCardViews: CsvImportCardView[];
  dataConfigCopy: DataConfigCopy;
  dataSourceSyncMonitorStateById: DataSourceSyncMonitorStateById;
  dataSourceSyncPrefsById: DataSourceSyncPrefsById;
  draggingPoolId: string;
  dragOverPoolId: string;
  formatLocalizedDateTime: (value: string | null) => string;
  formatMoney: (value: number, digits?: number) => string;
  isItemOperationBlocked: (item: HallSectionItem) => boolean;
  poolSettingsById: Map<string, PoolSettingsRow>;
  poolSettingsRows: PoolSettingsRow[];
  readModelSourceStatusById?: Record<string, DataConfigReadModelSourceStatus>;
  tt: (key: string) => string;
};

export const useDataConfigHallViewModel = ({
  baseTimeframeLabels,
  csvImportCardViews,
  dataConfigCopy,
  dataSourceSyncMonitorStateById,
  dataSourceSyncPrefsById,
  draggingPoolId,
  dragOverPoolId,
  formatLocalizedDateTime,
  formatMoney,
  isItemOperationBlocked,
  poolSettingsById,
  poolSettingsRows,
  readModelSourceStatusById,
  tt,
}: UseDataConfigHallViewModelParams) => {
  const hallSections = useMemo(
    () =>
      buildHallSections({
        baseTimeframeLabels,
        csvImportCardViews,
        poolSettingsById,
        poolSettingsRows,
      }),
    [baseTimeframeLabels, csvImportCardViews, poolSettingsById, poolSettingsRows],
  );

  const hallSectionsWithDragPreview = useMemo(
    () =>
      buildHallSectionsWithDragPreview(
        hallSections,
        draggingPoolId,
        dragOverPoolId,
      ),
    [dragOverPoolId, draggingPoolId, hallSections],
  );

  const resolveSummaryFilterForItem = useCallback(
    (item: HallSectionItem): SummaryFilterResolvedStatus =>
      resolveHallSummaryStatus({
        dataConfigCopy,
        dataSourceSyncMonitorStateById,
        dataSourceSyncPrefsById,
        formatLocalizedDateTime,
        formatMoney,
        itemOperationBlocked: isItemOperationBlocked(item),
        item,
        readModelSourceStatusById,
        tt,
      }),
    [
      dataConfigCopy,
      dataSourceSyncMonitorStateById,
      dataSourceSyncPrefsById,
      formatLocalizedDateTime,
      formatMoney,
      isItemOperationBlocked,
      readModelSourceStatusById,
      tt,
    ],
  );

  const cardLayoutSignature = useMemo(
    () =>
      hallSectionsWithDragPreview
        .map(
          (section) =>
            `${section.id}:${section.items.map((item) => item.id).join(",")}`,
        )
        .join("||"),
    [hallSectionsWithDragPreview],
  );

  return {
    cardLayoutSignature,
    hallSectionsWithDragPreview,
    resolveSummaryFilterForItem,
  };
};
