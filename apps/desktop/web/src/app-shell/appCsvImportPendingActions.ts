// SPDX-License-Identifier: GPL-3.0-only

import type { PendingCsvFolderImport } from "@/domains/data-import/dataSourceTypes";
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  normalizeApiTradingCalendarConfig,
  type ApiTradingCalendarConfig,
} from '@/api';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import {
  buildCsvImportTimeZoneConfirmationKey,
  CSV_IMPORT_TARGET_SOURCE_AUTO_CREATE_ID,
  type PendingCsvImportTargetSourceOption,
  type PendingCsvPlanOverride,
} from '@/app-shell/appCsvImportContracts';
import {
  normalizeTradingCalendarDraft,
} from '@/domains/data-import/tradingCalendarUi';
import {
  type CsvFieldKey,
  type CsvFieldMapping,
  type CsvTimestampMode,
} from '@/domains/data-import/csvHelpers';
import { normalizeTimeZone, resolveSystemTimeZone } from '@zinuto/shared/timezone';
import type { PendingCsvImportPoolGroup } from '@/app-shell/useAppCsvImportActions';

type UseAppCsvImportPendingActionsParams = {
  pendingCsvFolderImport: PendingCsvFolderImport | null;
  pendingCsvImportTimeZone: string;
  pendingCsvImportPoolGroups: PendingCsvImportPoolGroup[];
  pendingCsvImportTargetSourceOptions: PendingCsvImportTargetSourceOption[];
  customSamplePoolsCount: number;
  sanitizeSamplePoolName: (name: string, fallbackName: string) => string;
  markPendingCsvDraftValidationPending: () => void;
  setPendingCsvImportTimeZone: Dispatch<SetStateAction<string>>;
  setPendingCsvImportTimeZoneMode: Dispatch<SetStateAction<'AUTO' | 'MANUAL'>>;
  setPendingCsvFolderImport: Dispatch<SetStateAction<PendingCsvFolderImport | null>>;
  setPendingCsvFieldMapping: Dispatch<SetStateAction<CsvFieldMapping | null>>;
  setPendingCsvPlanOverrides: Dispatch<SetStateAction<Record<string, PendingCsvPlanOverride>>>;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values: Array<string | number>) => string;
  setPendingCsvImportTimeZoneConfirmationKey: Dispatch<SetStateAction<string>>;
};

export const useAppCsvImportPendingActions = ({
  pendingCsvFolderImport,
  pendingCsvImportTimeZone,
  pendingCsvImportPoolGroups,
  pendingCsvImportTargetSourceOptions,
  customSamplePoolsCount,
  sanitizeSamplePoolName,
  markPendingCsvDraftValidationPending,
  setPendingCsvImportTimeZone,
  setPendingCsvImportTimeZoneMode,
  setPendingCsvFolderImport,
  setPendingCsvFieldMapping,
  setPendingCsvPlanOverrides,
  ttf,
  setPendingCsvImportTimeZoneConfirmationKey,
}: UseAppCsvImportPendingActionsParams) => {
  const resolvePendingCsvPoolNamePrefix = useCallback(
    (pendingImport: { folderName: string }) => {
      const fallbackPoolName = ttf('appText.samplePoolValue0', [customSamplePoolsCount + 1]);
      const basePoolName = pendingImport.folderName ? pendingImport.folderName.trim() : fallbackPoolName;
      return sanitizeSamplePoolName(basePoolName, fallbackPoolName);
    },
    [customSamplePoolsCount, sanitizeSamplePoolName, ttf]
  );

  const updatePendingCsvPlanSourceId = useCallback(
    (planIdRaw: string, sourceIdRaw: string) => {
      markPendingCsvDraftValidationPending();
      const planId = String(planIdRaw || '').trim();
      if (!planId) {
        return;
      }
      const sourceId = String(sourceIdRaw || '').trim();
      setPendingCsvPlanOverrides((current) => {
        if (!pendingCsvImportPoolGroups.some((group) => group.previewPlanId === planId)) {
          return current;
        }
        const existing = current[planId] ?? {
          targetSourceId: '',
          sourceTouched: false,
          poolName: String(pendingCsvImportPoolGroups.find((group) => group.previewPlanId === planId)?.name || '').trim(),
          nameTouched: false
        };
        const matchedGroup = pendingCsvImportPoolGroups.find((group) => group.previewPlanId === planId);
        const matchedTargetSourceOption =
          (matchedGroup
            ? pendingCsvImportTargetSourceOptions.find(
                (option) =>
                  option.baseTimeframe === matchedGroup.baseTimeframe && option.sourceId === sourceId
              )
            : null) ?? null;
        const nextPoolName = existing.nameTouched
          ? existing.poolName
          : matchedTargetSourceOption?.sourceName || String(matchedGroup?.name || '').trim();
        if (existing.targetSourceId === sourceId && existing.sourceTouched) {
          return current;
        }
        return {
          ...current,
          [planId]: {
            ...existing,
            targetSourceId: sourceId,
            sourceTouched: true,
            poolName: nextPoolName
          }
        };
      });
    },
    [
      markPendingCsvDraftValidationPending,
      pendingCsvImportPoolGroups,
      pendingCsvImportTargetSourceOptions,
      setPendingCsvPlanOverrides,
    ]
  );

  const updatePendingCsvPlanPoolName = useCallback(
    (planIdRaw: string, poolNameRaw: string) => {
      const planId = String(planIdRaw || '').trim();
      if (!planId) {
        return;
      }
      const nextPoolName = String(poolNameRaw ?? '');
      setPendingCsvPlanOverrides((current) => {
        const matchedGroup = pendingCsvImportPoolGroups.find((group) => group.previewPlanId === planId);
        if (!matchedGroup) {
          return current;
        }
        const existing = current[planId] ?? {
          targetSourceId: CSV_IMPORT_TARGET_SOURCE_AUTO_CREATE_ID,
          sourceTouched: false,
          poolName: String(matchedGroup.name || '').trim(),
          nameTouched: false
        };
        const matchedTargetSourceOption = pendingCsvImportTargetSourceOptions.find(
          (option) =>
            option.baseTimeframe === matchedGroup.baseTimeframe && option.sourceId === existing.targetSourceId
        );
        const matchedTargetSourceName = matchedTargetSourceOption ? String(matchedTargetSourceOption.sourceName || '') : '';
        const isFullReimport =
          pendingCsvFolderImport?.importEntryMode === 'FULL_REIMPORT';
        const shouldSwitchToAutoCreate =
          !isFullReimport &&
          Boolean(matchedTargetSourceOption) &&
          nextPoolName.trim() !== matchedTargetSourceName.trim();
        if (
          existing.poolName === nextPoolName &&
          existing.nameTouched &&
          !shouldSwitchToAutoCreate
        ) {
          return current;
        }
        return {
          ...current,
          [planId]: {
            ...existing,
            targetSourceId: shouldSwitchToAutoCreate ? CSV_IMPORT_TARGET_SOURCE_AUTO_CREATE_ID : existing.targetSourceId,
            poolName: nextPoolName,
            nameTouched: true
          }
        };
      });
    },
    [
      pendingCsvFolderImport?.importEntryMode,
      pendingCsvImportPoolGroups,
      pendingCsvImportTargetSourceOptions,
      setPendingCsvPlanOverrides,
    ]
  );

  const resetPendingCsvImportTimeZoneRecommendation = useCallback(() => {
    const recommendedTimeZone = normalizeTimeZone(
      pendingCsvFolderImport?.importPlanning?.recommendedTimeZone ||
        pendingCsvFolderImport?.draftValidation?.planning.recommendedTimeZone ||
        pendingCsvFolderImport?.suggestedTimeZone ||
        resolveSystemTimeZone()
    );
    setPendingCsvImportTimeZoneMode('AUTO');
    setPendingCsvImportTimeZone(recommendedTimeZone);
    setPendingCsvImportTimeZoneConfirmationKey('');
  }, [
    pendingCsvFolderImport,
    setPendingCsvImportTimeZone,
    setPendingCsvImportTimeZoneConfirmationKey,
    setPendingCsvImportTimeZoneMode
  ]);

  const resetPendingCsvImportTradingCalendarRecommendation = useCallback(() => {
    setPendingCsvFolderImport((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        tradingCalendar: normalizeApiTradingCalendarConfig(
          current.importPlanning?.recommendedTradingCalendar ||
            current.draftValidation?.planning.recommendedTradingCalendar ||
            current.tradingCalendarSuggestion.calendar,
        ),
        tradingCalendarTouched: false,
        draftValidation: null,
      };
    });
  }, [setPendingCsvFolderImport]);

  const updatePendingCsvImportTradingCalendar = useCallback(
    (tradingCalendar: ApiTradingCalendarConfig) => {
      setPendingCsvFolderImport((current) =>
        current
          ? {
              ...current,
              tradingCalendar: normalizeTradingCalendarDraft(tradingCalendar),
              tradingCalendarTouched: true,
              draftValidation: null,
            }
          : current,
      );
    },
    [setPendingCsvFolderImport],
  );

  const confirmPendingCsvImportTimeZone = useCallback(
    (timeZoneRaw?: string) => {
      const normalizedTimeZone = normalizeTimeZone(
        timeZoneRaw ?? pendingCsvImportTimeZone,
        pendingCsvImportTimeZone || resolveSystemTimeZone(),
      );
      setPendingCsvImportTimeZone(normalizedTimeZone);
      setPendingCsvImportTimeZoneMode('MANUAL');
      setPendingCsvImportTimeZoneConfirmationKey(
        buildCsvImportTimeZoneConfirmationKey(
          pendingCsvFolderImport?.previewToken,
          normalizedTimeZone,
        ),
      );
    },
    [
      pendingCsvFolderImport?.previewToken,
      pendingCsvImportTimeZone,
      setPendingCsvImportTimeZone,
      setPendingCsvImportTimeZoneConfirmationKey,
      setPendingCsvImportTimeZoneMode,
    ],
  );

  const updatePendingCsvImportTimeZone = useCallback(
    (timeZoneRaw: string) => {
      const normalizedTimeZone = normalizeTimeZone(
        timeZoneRaw,
        pendingCsvImportTimeZone || resolveSystemTimeZone(),
      );
      setPendingCsvImportTimeZoneMode('MANUAL');
      setPendingCsvImportTimeZone(normalizedTimeZone);
      setPendingCsvImportTimeZoneConfirmationKey(
        buildCsvImportTimeZoneConfirmationKey(
          pendingCsvFolderImport?.previewToken,
          normalizedTimeZone,
        ),
      );
    },
    [
      pendingCsvFolderImport?.previewToken,
      pendingCsvImportTimeZone,
      setPendingCsvImportTimeZone,
      setPendingCsvImportTimeZoneConfirmationKey,
      setPendingCsvImportTimeZoneMode
    ]
  );

  const updatePendingCsvMapping = useCallback(
    (field: CsvFieldKey, header: string) => {
      markPendingCsvDraftValidationPending();
      setPendingCsvFieldMapping((current) => {
        const base = current ?? pendingCsvFolderImport?.mapping ?? null;
        if (!base) {
          return current;
        }
        return {
          ...base,
          [field]: header
        };
      });
    },
    [
      markPendingCsvDraftValidationPending,
      pendingCsvFolderImport,
      setPendingCsvFieldMapping,
    ]
  );

  const updatePendingCsvTimestampMode = useCallback(
    (mode: CsvTimestampMode) => {
      markPendingCsvDraftValidationPending();
      setPendingCsvFieldMapping((current) => {
        const normalizedMode: CsvTimestampMode = mode === 'SPLIT' ? 'SPLIT' : 'SINGLE';
        const defaultFromPreview = pendingCsvFolderImport?.mapping ?? null;
        if (!current && !defaultFromPreview) {
          return current;
        }
        const base = current ?? defaultFromPreview;
        if (!base) {
          return current;
        }
        const next = {
          ...base,
          timestampMode: normalizedMode
        };
        if (normalizedMode === 'SINGLE') {
          next.time = '';
        } else if (!String(next.time ?? '').trim()) {
          next.time = String(defaultFromPreview?.time ?? '').trim();
        }
        if (
          current &&
          current.timestampMode === next.timestampMode &&
          current.date === next.date &&
          current.time === next.time &&
          current.open === next.open &&
          current.high === next.high &&
          current.low === next.low &&
          current.close === next.close &&
          current.volume === next.volume
        ) {
          return current;
        }
        return next;
      });
    },
    [
      markPendingCsvDraftValidationPending,
      pendingCsvFolderImport,
      setPendingCsvFieldMapping,
    ]
  );

  return {
    resolvePendingCsvPoolNamePrefix,
    updatePendingCsvPlanSourceId,
    updatePendingCsvPlanPoolName,
    resetPendingCsvImportTimeZoneRecommendation,
    resetPendingCsvImportTradingCalendarRecommendation,
    updatePendingCsvImportTradingCalendar,
    confirmPendingCsvImportTimeZone,
    updatePendingCsvImportTimeZone,
    updatePendingCsvMapping,
    updatePendingCsvTimestampMode,
  };
};
