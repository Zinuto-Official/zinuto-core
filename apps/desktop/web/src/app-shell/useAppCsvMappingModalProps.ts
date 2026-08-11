// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from 'react';
import type { AppCsvMappingModalProps } from '@/app-shell/AppCsvMappingModal';

type UseAppCsvMappingModalPropsArgs = {
  pendingImport: AppCsvMappingModalProps['pendingImport'];
  pendingFieldMapping: AppCsvMappingModalProps['pendingFieldMapping'];
  pendingPlanConfigRows: AppCsvMappingModalProps['pendingPlanConfigRows'];
  pendingImportTimeZone: AppCsvMappingModalProps['pendingImportTimeZone'];
  pendingImportTimeZoneMode: AppCsvMappingModalProps['pendingImportTimeZoneMode'];
  pendingImportTimeZoneConfirmed: AppCsvMappingModalProps['pendingImportTimeZoneConfirmed'];
  pendingImportScopeStrategy: AppCsvMappingModalProps['pendingImportScopeStrategy'];
  importReadinessSummaryText: AppCsvMappingModalProps['importReadinessSummaryText'];
  availableTimeZones: AppCsvMappingModalProps['availableTimeZones'];
  isPreparingCsvImportPreview: boolean;
  getCsvFieldLabels: () => AppCsvMappingModalProps['csvFieldLabels'];
  getBaseTimeframeLabels: () => AppCsvMappingModalProps['baseTimeframeLabels'];
  tt: AppCsvMappingModalProps['tt'];
  ttf: AppCsvMappingModalProps['ttf'];
  onPendingImportTimeZoneChange: AppCsvMappingModalProps['onPendingImportTimeZoneChange'];
  onConfirmPendingImportTimeZone: AppCsvMappingModalProps['onConfirmPendingImportTimeZone'];
  onResetPendingImportTimeZoneRecommendation: AppCsvMappingModalProps['onResetPendingImportTimeZoneRecommendation'];
  onPendingImportTradingCalendarChange: AppCsvMappingModalProps['onPendingImportTradingCalendarChange'];
  onResetPendingImportTradingCalendarRecommendation: AppCsvMappingModalProps['onResetPendingImportTradingCalendarRecommendation'];
  onPendingImportScopeStrategyChange: AppCsvMappingModalProps['onPendingImportScopeStrategyChange'];
  onUpdatePendingCsvTimestampMode: AppCsvMappingModalProps['onUpdatePendingCsvTimestampMode'];
  onUpdatePendingCsvMapping: AppCsvMappingModalProps['onUpdatePendingCsvMapping'];
  onPendingPlanPoolNameChange: AppCsvMappingModalProps['onPendingPlanPoolNameChange'];
  onPendingPlanSourceIdChange: AppCsvMappingModalProps['onPendingPlanSourceIdChange'];
  onCancelPendingCsvImport: AppCsvMappingModalProps['onCancelPendingCsvImport'];
  onConfirmPendingCsvImport: AppCsvMappingModalProps['onConfirmPendingCsvImport'];
};

export const useAppCsvMappingModalProps = ({
  pendingImport,
  pendingFieldMapping,
  pendingPlanConfigRows,
  pendingImportTimeZone,
  pendingImportTimeZoneMode,
  pendingImportTimeZoneConfirmed,
  pendingImportScopeStrategy,
  importReadinessSummaryText,
  availableTimeZones,
  isPreparingCsvImportPreview,
  getCsvFieldLabels,
  getBaseTimeframeLabels,
  tt,
  ttf,
  onPendingImportTimeZoneChange,
  onConfirmPendingImportTimeZone,
  onResetPendingImportTimeZoneRecommendation,
  onPendingImportTradingCalendarChange,
  onResetPendingImportTradingCalendarRecommendation,
  onPendingImportScopeStrategyChange,
  onUpdatePendingCsvTimestampMode,
  onUpdatePendingCsvMapping,
  onPendingPlanPoolNameChange,
  onPendingPlanSourceIdChange,
  onCancelPendingCsvImport,
  onConfirmPendingCsvImport
}: UseAppCsvMappingModalPropsArgs): AppCsvMappingModalProps => {
  const csvFieldLabels = useMemo(() => getCsvFieldLabels(), [getCsvFieldLabels]);
  const baseTimeframeLabels = useMemo(() => getBaseTimeframeLabels(), [getBaseTimeframeLabels]);

  return useMemo(
    () => ({
      pendingImport,
      pendingFieldMapping,
      pendingPlanConfigRows,
      pendingImportTimeZone,
      pendingImportTimeZoneMode,
      pendingImportTimeZoneConfirmed,
      pendingImportScopeStrategy,
      importReadinessSummaryText,
      availableTimeZones,
      isPreparingCsvImportPreview,
      csvFieldLabels,
      baseTimeframeLabels,
      tt,
      ttf,
      onPendingImportTimeZoneChange,
      onConfirmPendingImportTimeZone,
      onResetPendingImportTimeZoneRecommendation,
      onPendingImportTradingCalendarChange,
      onResetPendingImportTradingCalendarRecommendation,
      onPendingImportScopeStrategyChange,
      onUpdatePendingCsvTimestampMode,
      onUpdatePendingCsvMapping,
      onPendingPlanPoolNameChange,
      onPendingPlanSourceIdChange,
      onCancelPendingCsvImport,
      onConfirmPendingCsvImport
    }),
    [
      pendingImport,
      pendingFieldMapping,
      pendingPlanConfigRows,
      pendingImportTimeZone,
      pendingImportTimeZoneMode,
      pendingImportTimeZoneConfirmed,
      pendingImportScopeStrategy,
      importReadinessSummaryText,
      availableTimeZones,
      isPreparingCsvImportPreview,
      csvFieldLabels,
      baseTimeframeLabels,
      tt,
      ttf,
      onPendingImportTimeZoneChange,
      onConfirmPendingImportTimeZone,
      onResetPendingImportTimeZoneRecommendation,
      onPendingImportTradingCalendarChange,
      onResetPendingImportTradingCalendarRecommendation,
      onPendingImportScopeStrategyChange,
      onUpdatePendingCsvTimestampMode,
      onUpdatePendingCsvMapping,
      onPendingPlanPoolNameChange,
      onPendingPlanSourceIdChange,
      onCancelPendingCsvImport,
      onConfirmPendingCsvImport
    ]
  );
};
