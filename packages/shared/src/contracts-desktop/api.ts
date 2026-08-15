// SPDX-License-Identifier: GPL-3.0-only

import { z } from "zod";

import {
  desktopBacktestBatchCreateRequestSchema,
  desktopBacktestBatchListSchema,
  desktopBacktestBatchRunRequestSchema,
  desktopBacktestBatchSchema,
  desktopBacktestClearResultSchema,
  desktopBacktestConfigSchema,
  desktopBacktestDeleteResultSchema,
  desktopBacktestDirectionSignalRuleSchema,
  desktopBacktestProgressSchema,
  desktopBacktestResultDetailSchema,
  desktopBacktestResultsSchema,
  desktopBacktestSignalRuleConditionSchema,
  desktopBacktestSignalRuleOperandSchema,
  desktopBacktestSignalRuleOperatorSchema,
  desktopBacktestSignalRulesSchema,
} from "./backtest.js";
import {
  desktopAkshareAcquisitionInstrumentCatalogSchema,
  desktopCcxtAcquisitionMarketCatalogSchema,
  desktopMarketDataAcquisitionConnectorCatalogSchema,
  desktopMarketDataAcquisitionCatalogSchema,
  desktopMarketDataAcquisitionDiscardResultSchema,
  desktopMarketDataAcquisitionInstrumentCatalogSchema,
  desktopMarketDataAcquisitionJobCreateRequestSchema,
  desktopMarketDataAcquisitionJobListSchema,
  desktopMarketDataAcquisitionJobSchema,
  desktopMarketDataAcquisitionMarketJobCreateRequestSchema,
  desktopMarketDataAcquisitionMarketJobSchema,
} from "./market-data-acquisition.js";
import {
  desktopWorkspaceIdSchema,
  desktopWorkspaceReadModelToneSchema,
  desktopWorkspaceReadModelActionSchema,
  desktopWorkspaceReadModelSectionSchema,
  desktopWorkspaceReadModelSchema,
  desktopCustomIndicatorCompiledPayloadSchema,
  desktopCustomIndicatorProfileSchema,
  desktopCustomIndicatorProfileListSchema,
  desktopCustomIndicatorProfilesReplaceRequestSchema,
  desktopCustomIndicatorProfilesReplaceResultSchema,
  desktopCustomIndicatorProfileSaveRequestSchema,
  desktopCustomIndicatorProfileSaveResultSchema,
  desktopCustomIndicatorProfileDeleteRequestSchema,
  desktopCustomIndicatorProfileDeleteResultSchema,
  desktopCustomIndicatorCompileRequestSchema,
  desktopCustomIndicatorCompileResultSchema,
  desktopCustomIndicatorExecuteRequestSchema,
  desktopCustomIndicatorExecuteResultSchema,
  desktopInstrumentSchema,
  desktopInstrumentListSchema,
  desktopBarsRangeSchema,
  desktopMarketBarFrameSchema,
  desktopSecurityIntegritySchema,
  desktopSystemStartupStatusSchema,
  desktopStartupLocalDataReinitializeRequestSchema,
  desktopStartupLocalDataReinitializeResultSchema,
  desktopSystemHealthSchema,
  desktopSessionSchema,
  desktopSessionSnapshotSchema,
  desktopSessionBootstrapSchema,
  desktopSessionStepResultSchema,
  desktopSessionOrderQuoteSchema,
  desktopFreeReplayStartReadinessSchema,
  desktopFreeReplayPrepReadModelSchema,
  desktopPreparedFreeReplayStartResultSchema,
  desktopFreeReplayStartPointOverviewRangeSchema,
} from "./api-foundation.js";
import { desktopSpecialTrainingOrderQuoteSchema } from "./special-training.js";
import {
  desktopLocalDataImportDraftValidationSchema,
  desktopLocalDataImportJobSchema,
  desktopLocalDataImportPreviewJobSchema,
  desktopLocalDataImportPreviewDiscardResultSchema,
  desktopFreeReplayPoolDefaultEnvironmentSchema,
  desktopFreeReplayPoolDefaultEnvironmentRecordSchema,
  desktopLocalDataSourceSummarySchema,
  desktopLocalDataSourceListSchema,
  desktopLocalDataSyncPreviewSchema,
  desktopLocalDataSyncQuickCheckSchema,
  desktopLocalDataSourceSymbolDiagnosticsSchema,
  desktopLocalDataSourceDiagnosticsSchema,
  desktopLocalDataSourceDiagnosticProfileUpdateRequestSchema,
  desktopLocalDataClearAllResultSchema,
  desktopLocalDataDeleteSourceResultSchema,
  desktopResetAllDataModuleProgressSchema,
  desktopResetAllDataResultSchema,
  desktopResetAllDataJobSchema,
  desktopLocalDataRemoveSymbolsResultSchema,
  desktopSpecialTrainingBankScopeSummarySchema,
  desktopSpecialTrainingBankEditorReadModelSchema,
  desktopSpecialTrainingBankSchema,
  desktopSpecialTrainingBankListSchema,
  desktopSpecialTrainingBankDeleteResultSchema,
  desktopSpecialTrainingDurationEstimateSchema,
  desktopSpecialTrainingChallengeActivityRequestSchema,
  desktopSpecialTrainingChallengeActivityResultSchema,
  desktopSpecialTrainingChallengeProgressSchema,
  desktopSpecialTrainingChallengeRuntimeSchema,
  desktopSpecialTrainingSettlementSchema,
  desktopSpecialTrainingChallengeSchema,
  desktopSpecialTrainingChallengeCommandResultSchema,
  desktopSpecialTrainingChallengeDiscardResultSchema,
  desktopSpecialTrainingQuestionBankSummarySchema,
  desktopSpecialTrainingHistorySessionListSchema,
  desktopSpecialTrainingHistorySessionDetailSchema,
  desktopSpecialTrainingHistoryQuestionDetailSchema,
  desktopSpecialTrainingHistoryClearResultSchema,
  desktopSpecialTrainingStatsPayloadSchema,
  desktopTrainingStatsSummarySchema,
  desktopSpecialTrainingStatsSummarySchema,
  desktopSpecialTrainingStatsProjectDetailSchema,
  desktopSessionCreateRequestSchema,
  desktopSessionBootstrapRequestSchema,
  desktopSessionTradingSettingsUpdateRequestSchema,
  desktopSessionActionRequestSchema,
  desktopSessionOrderQuoteRequestSchema,
  desktopPreparedFreeReplayStartRequestSchema,
  desktopFreeReplayPrepReadModelRequestSchema,
  desktopFreeReplayStartReadinessRequestSchema,
  desktopFreeReplayStartPointOverviewRequestSchema,
  desktopSpecialTrainingChallengeStartRequestSchema,
  desktopSpecialTrainingQuestionBankPreviewRequestSchema,
  desktopSpecialTrainingQuestionBankResetRequestSchema,
  desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema,
  desktopSpecialTrainingBankEditorReadModelRequestSchema,
  desktopSpecialTrainingChallengeActionRequestSchema,
  desktopSpecialTrainingOrderQuoteRequestSchema,
  desktopSpecialTrainingDecisionRequestSchema,
  desktopSpecialTrainingQuestionSettleRequestSchema,
  desktopLocalDataImportByPathRequestSchema,
  desktopLocalDataFullReimportByPathRequestSchema,
  desktopLocalDataIncrementalUpdateByPathRequestSchema,
  desktopLocalDataSourceTradingCalendarUpdateRequestSchema,
  desktopLocalDataImportPreviewByPathRequestSchema,
  desktopLocalDataImportDraftValidationRequestSchema,
  desktopLocalDataImportPreviewDiscardRequestSchema,
  desktopLocalDataSyncPreviewByPathRequestSchema,
  desktopLocalDataSyncQuickCheckByMetadataRequestSchema,
  desktopLocalDataImportControlRequestSchema,
  desktopLocalDataSourceRemoveSymbolsRequestSchema,
  desktopPortableExportPreviewRequestSchema,
  desktopPortableExportRequestSchema,
  desktopPortableImportInspectRequestSchema,
  desktopPortableImportRequestSchema,
  desktopLocalImportMockSampleExportRequestSchema,
  desktopLocalImportMockSampleExportResultSchema,
  desktopLegalDocumentResponseSchema,
} from "./api-operations.js";

export {
  desktopWorkspaceIdSchema,
  desktopWorkspaceReadModelToneSchema,
  desktopWorkspaceCopyRefSchema,
  desktopWorkspaceReadModelActionSchema,
  desktopWorkspaceReadModelSectionSchema,
  desktopWorkspaceReadModelSchema,
  desktopCustomIndicatorCompiledPayloadSchema,
  desktopCustomIndicatorProfileSchema,
  desktopCustomIndicatorProfileListSchema,
  desktopCustomIndicatorProfilesReplaceRequestSchema,
  desktopCustomIndicatorProfilesReplaceResultSchema,
  desktopCustomIndicatorProfileSaveRequestSchema,
  desktopCustomIndicatorProfileSaveResultSchema,
  desktopCustomIndicatorProfileDeleteRequestSchema,
  desktopCustomIndicatorProfileDeleteResultSchema,
  desktopCustomIndicatorCompileRequestSchema,
  desktopCustomIndicatorCompileErrorSchema,
  desktopCustomIndicatorCompileResultSchema,
  desktopCustomIndicatorExecuteRequestSchema,
  desktopCustomIndicatorRenderInstructionSchema,
  desktopCustomIndicatorRuntimeErrorSchema,
  desktopCustomIndicatorRuntimeStatsSchema,
  desktopCustomIndicatorExecuteResultSchema,
  desktopTradingCalendarConfigSchema,
  desktopBarSchema,
  desktopInstrumentSchema,
  desktopInstrumentListSchema,
  desktopBarsRangeSchema,
  desktopMarketBarFrameSchema,
  desktopSecurityIntegritySchema,
  desktopSystemStartupStatusSchema,
  desktopStartupLocalDataReinitializeRequestSchema,
  desktopStartupLocalDataReinitializeResultSchema,
  desktopSystemHealthSchema,
  desktopSessionSchema,
  desktopSessionSnapshotSchema,
  desktopSessionBootstrapSchema,
  desktopSessionRuntimeDeltaSchema,
  desktopSessionStepResultSchema,
  desktopSessionOrderQuoteSchema,
  desktopFreeReplayStartReadinessSchema,
  desktopFreeReplayPrepReadModelSchema,
  desktopPreparedFreeReplayStartResultSchema,
  desktopFreeReplayStartPointOverviewRangeSchema,
} from "./api-foundation.js";
export { desktopSpecialTrainingOrderQuoteSchema } from "./special-training.js";
export {
  desktopLocalDataImportDraftValidationSchema,
  desktopLocalDataImportJobSchema,
  desktopLocalDataImportFolderPreviewSchema,
  desktopLocalDataImportPreviewJobSchema,
  desktopLocalDataImportPreviewDiscardResultSchema,
  desktopFreeReplayPoolDefaultEnvironmentSchema,
  desktopFreeReplayPoolDefaultEnvironmentRecordSchema,
  desktopLocalDataSourceSummarySchema,
  desktopLocalDataSourceListSchema,
  desktopLocalDataSyncPreviewSchema,
  desktopLocalDataSyncQuickCheckSchema,
  desktopLocalDataSourceSymbolDiagnosticsSchema,
  desktopLocalDataSourceDiagnosticsSchema,
  desktopLocalDataSourceDiagnosticProfileUpdateRequestSchema,
  desktopLocalDataClearAllResultSchema,
  desktopLocalDataDeleteSourceResultSchema,
  desktopResetAllDataModuleProgressSchema,
  desktopResetAllDataResultSchema,
  desktopResetAllDataJobSchema,
  desktopLocalDataRemoveSymbolsResultSchema,
  desktopSpecialTrainingBankScopeSummarySchema,
  desktopSpecialTrainingBankEditorReadModelSchema,
  desktopSpecialTrainingBankSchema,
  desktopSpecialTrainingBankListSchema,
  desktopSpecialTrainingBankDeleteResultSchema,
  desktopSpecialTrainingDurationEstimateSchema,
  desktopSpecialTrainingChallengeActivityRequestSchema,
  desktopSpecialTrainingChallengeActivityResultSchema,
  desktopSpecialTrainingChallengeProgressSchema,
  desktopSpecialTrainingChallengeRuntimeSchema,
  desktopSpecialTrainingSettlementSchema,
  desktopSpecialTrainingChallengeSchema,
  desktopSpecialTrainingChallengeCommandResultSchema,
  desktopSpecialTrainingChallengeDiscardResultSchema,
  desktopSpecialTrainingQuestionBankSummarySchema,
  desktopSpecialTrainingHistorySessionListSchema,
  desktopSpecialTrainingHistorySessionDetailSchema,
  desktopSpecialTrainingHistoryQuestionDetailSchema,
  desktopSpecialTrainingHistoryClearResultSchema,
  desktopSpecialTrainingStatsPayloadSchema,
  desktopTrainingStatsSummarySchema,
  desktopSpecialTrainingStatsSummarySchema,
  desktopSpecialTrainingStatsProjectDetailSchema,
  desktopSessionCreateRequestSchema,
  desktopSessionBootstrapRequestSchema,
  desktopSessionTradingSettingsUpdateRequestSchema,
  desktopSessionActionRequestSchema,
  desktopSessionOrderQuoteRequestSchema,
  desktopPreparedFreeReplayStartRequestSchema,
  desktopFreeReplayPrepReadModelRequestSchema,
  desktopFreeReplayStartReadinessRequestSchema,
  desktopFreeReplayStartPointOverviewRequestSchema,
  desktopSpecialTrainingChallengeStartRequestSchema,
  desktopSpecialTrainingQuestionBankPreviewRequestSchema,
  desktopSpecialTrainingQuestionBankResetRequestSchema,
  desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema,
  desktopSpecialTrainingBankEditorReadModelRequestSchema,
  desktopSpecialTrainingChallengeActionRequestSchema,
  desktopSpecialTrainingOrderQuoteRequestSchema,
  desktopSpecialTrainingDecisionRequestSchema,
  desktopSpecialTrainingQuestionSettleRequestSchema,
  desktopLocalDataImportByPathRequestSchema,
  desktopLocalDataFullReimportByPathRequestSchema,
  desktopLocalDataIncrementalUpdateByPathRequestSchema,
  desktopLocalDataSourceTradingCalendarUpdateRequestSchema,
  desktopLocalDataImportPreviewByPathRequestSchema,
  desktopLocalDataImportDraftValidationRequestSchema,
  desktopLocalDataImportPreviewDiscardRequestSchema,
  desktopLocalDataSyncPreviewByPathRequestSchema,
  desktopLocalDataSyncQuickCheckByMetadataRequestSchema,
  desktopLocalDataImportControlRequestSchema,
  desktopLocalDataSourceRemoveSymbolsRequestSchema,
  desktopPortableExportPreviewRequestSchema,
  desktopPortableExportRequestSchema,
  desktopPortableImportInspectRequestSchema,
  desktopPortableImportRequestSchema,
  desktopLocalImportMockSampleExportRequestSchema,
  desktopLocalImportMockSampleExportResultSchema,
  desktopLegalDocumentResponseSchema,
} from "./api-operations.js";
export * from "./backtest.js";
export * from "./market-data-acquisition.js";

// This route-schema map is generated by tools/contracts/generate-openapi-contracts.mjs.
export const DESKTOP_LOCAL_RESPONSE_SCHEMAS = {
  "/api/v1/system/health": desktopSystemHealthSchema,
  "/api/v1/system/startup-status": desktopSystemStartupStatusSchema,
  "/api/v1/system/startup-local-data/reinitialize": desktopStartupLocalDataReinitializeResultSchema,
  "/api/v1/workspaces/command-center": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/trainer": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/history/review-console": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/challenge-stats": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/special-training": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/data-management": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/notes": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/settings": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/custom-indicator": desktopWorkspaceReadModelSchema,
  "/api/v1/workspaces/strategy-backtest": desktopWorkspaceReadModelSchema,
  "/api/v1/system/legal-documents/:documentKey": desktopLegalDocumentResponseSchema,
  "/api/v1/system/reset-all-data/start": desktopResetAllDataJobSchema,
  "/api/v1/system/reset-all-data/jobs/:jobId": desktopResetAllDataJobSchema,
  "/api/v1/system/local-import-mock-sample/export": desktopLocalImportMockSampleExportResultSchema,
  "/api/v1/market/instruments": desktopInstrumentListSchema,
  "/api/v1/market/instruments/:instrumentId/bars/range": desktopBarsRangeSchema,
  "/api/v1/market/instruments/:instrumentId/bars/frame": desktopMarketBarFrameSchema,
  "/api/v1/training/free-replay/sessions": desktopSessionSchema,
  "/api/v1/training/free-replay/sessions/bootstrap": desktopSessionBootstrapSchema,
  "/api/v1/training/free-replay/sessions/:id/bootstrap": desktopSessionBootstrapSchema,
  "/api/v1/training/free-replay/sessions/:id/snapshot": desktopSessionSnapshotSchema,
  "/api/v1/training/free-replay/sessions/:id/trading-settings": desktopSessionSnapshotSchema,
  "/api/v1/training/free-replay/sessions/:id/actions": desktopSessionStepResultSchema,
  "/api/v1/training/free-replay/sessions/:id/order/quote": desktopSessionOrderQuoteSchema,
  "/api/v1/training/free-replay/sessions/start": desktopPreparedFreeReplayStartResultSchema,
  "/api/v1/training/free-replay/prep-read-model": desktopFreeReplayPrepReadModelSchema,
  "/api/v1/training/free-replay/start-readiness": desktopFreeReplayStartReadinessSchema,
  "/api/v1/training/free-replay/start-point-overview": desktopFreeReplayStartPointOverviewRangeSchema,
  "/api/v1/training/free-replay/pool-default-environments": desktopFreeReplayPoolDefaultEnvironmentRecordSchema,
  "/api/v1/training/free-replay/pool-default-environments/:poolId": desktopFreeReplayPoolDefaultEnvironmentRecordSchema,
  "/api/v1/training/stats/summary": desktopTrainingStatsSummarySchema,
  "/api/v1/training/special/banks": desktopSpecialTrainingBankListSchema
    .or(desktopSpecialTrainingBankSchema),
  "/api/v1/training/special/banks/:bankId": desktopSpecialTrainingBankSchema
    .or(desktopSpecialTrainingBankDeleteResultSchema),
  "/api/v1/training/special/estimate": desktopSpecialTrainingDurationEstimateSchema,
  "/api/v1/training/special/challenges/start": desktopSpecialTrainingChallengeSchema,
  "/api/v1/training/special/challenges/:challengeId": desktopSpecialTrainingChallengeDiscardResultSchema,
  "/api/v1/training/special/challenges/:challengeId/runtime": desktopSpecialTrainingChallengeRuntimeSchema,
  "/api/v1/training/special/challenges/:challengeId/activity": desktopSpecialTrainingChallengeActivityResultSchema,
  "/api/v1/training/special/challenges/:challengeId/progress": desktopSpecialTrainingChallengeProgressSchema,
  "/api/v1/training/special/challenges/:challengeId/order/quote": desktopSpecialTrainingOrderQuoteSchema,
  "/api/v1/training/special/challenges/:challengeId/actions": desktopSpecialTrainingChallengeCommandResultSchema,
  "/api/v1/training/special/challenges/:challengeId/decision": desktopSpecialTrainingChallengeCommandResultSchema,
  "/api/v1/training/special/challenges/:challengeId/questions/:questionId/settle": desktopSpecialTrainingSettlementSchema,
  "/api/v1/training/special/question-bank/preview": desktopSpecialTrainingQuestionBankSummarySchema,
  "/api/v1/training/special/question-bank/draft-preview": desktopSpecialTrainingBankScopeSummarySchema,
  "/api/v1/training/special/bank-editor/read-model": desktopSpecialTrainingBankEditorReadModelSchema,
  "/api/v1/training/special/question-bank/reset": desktopSpecialTrainingQuestionBankSummarySchema,
  "/api/v1/training/special/history": desktopSpecialTrainingHistorySessionListSchema,
  "/api/v1/training/special/history/:sessionId": desktopSpecialTrainingHistorySessionDetailSchema,
  "/api/v1/training/special/history/questions/:questionId": desktopSpecialTrainingHistoryQuestionDetailSchema,
  "/api/v1/training/special/history/clear": desktopSpecialTrainingHistoryClearResultSchema,
  "/api/v1/training/special/stats": desktopSpecialTrainingStatsPayloadSchema,
  "/api/v1/training/special/stats/summary": desktopSpecialTrainingStatsSummarySchema,
  "/api/v1/training/special/stats/details/:projectId": desktopSpecialTrainingStatsProjectDetailSchema,
  "/api/v1/data-sources/acquisition-connectors": desktopMarketDataAcquisitionConnectorCatalogSchema,
  "/api/v1/data-sources/acquisition-catalog": desktopMarketDataAcquisitionCatalogSchema,
  "/api/v1/data-sources/acquisition-markets/:marketId/instruments": desktopMarketDataAcquisitionInstrumentCatalogSchema,
  "/api/v1/data-sources/acquisition-connectors/ccxt/markets": desktopCcxtAcquisitionMarketCatalogSchema,
  "/api/v1/data-sources/acquisition-connectors/akshare/instruments": desktopAkshareAcquisitionInstrumentCatalogSchema,
  "/api/v1/data-sources/acquisition-jobs": desktopMarketDataAcquisitionJobSchema,
  "/api/v1/data-sources/acquisition-market-jobs": desktopMarketDataAcquisitionJobListSchema
    .or(desktopMarketDataAcquisitionMarketJobSchema),
  "/api/v1/data-sources/acquisition-market-jobs/:jobId": desktopMarketDataAcquisitionMarketJobSchema
    .or(desktopMarketDataAcquisitionDiscardResultSchema),
  "/api/v1/data-sources/acquisition-market-jobs/:jobId/cancel": desktopMarketDataAcquisitionMarketJobSchema,
  "/api/v1/data-sources/acquisition-jobs/:jobId": desktopMarketDataAcquisitionJobSchema
    .or(desktopMarketDataAcquisitionDiscardResultSchema),
  "/api/v1/data-sources/acquisition-jobs/:jobId/cancel": desktopMarketDataAcquisitionJobSchema,
  "/api/v1/data-sources/import/from-paths": desktopLocalDataImportJobSchema,
  "/api/v1/data-sources/import/preview/from-path": desktopLocalDataImportPreviewJobSchema,
  "/api/v1/data-sources/import/preview-jobs/:jobId": desktopLocalDataImportPreviewJobSchema,
  "/api/v1/data-sources/import/preview/discard": desktopLocalDataImportPreviewDiscardResultSchema,
  "/api/v1/data-sources/import/preview/validate": desktopLocalDataImportDraftValidationSchema,
  "/api/v1/data-sources/import-jobs/:jobId": desktopLocalDataImportJobSchema,
  "/api/v1/data-sources/import-jobs/:jobId/control": desktopLocalDataImportJobSchema,
  "/api/v1/data-sources": desktopLocalDataSourceListSchema,
  "/api/v1/data-sources/clear-all": desktopLocalDataClearAllResultSchema,
  "/api/v1/data-sources/:sourceId": desktopLocalDataDeleteSourceResultSchema,
  "/api/v1/data-sources/:sourceId/incremental-update/from-paths": desktopLocalDataImportJobSchema,
  "/api/v1/data-sources/:sourceId/full-reimport/from-paths": desktopLocalDataImportJobSchema,
  "/api/v1/data-sources/:sourceId/trading-calendar": desktopLocalDataSourceSummarySchema,
  "/api/v1/data-sources/:sourceId/sync-preview/from-paths": desktopLocalDataSyncPreviewSchema,
  "/api/v1/data-sources/:sourceId/sync-quick-check/from-metadata": desktopLocalDataSyncQuickCheckSchema,
  "/api/v1/data-sources/:sourceId/diagnostics": desktopLocalDataSourceDiagnosticsSchema,
  "/api/v1/data-sources/:sourceId/diagnostic-profile": desktopLocalDataSourceDiagnosticsSchema,
  "/api/v1/data-sources/:sourceId/symbols/:symbol/diagnostics": desktopLocalDataSourceSymbolDiagnosticsSchema,
  "/api/v1/data-sources/:sourceId/symbols/remove": desktopLocalDataRemoveSymbolsResultSchema,
  "/api/v1/custom-indicators/profiles": desktopCustomIndicatorProfileListSchema
    .or(desktopCustomIndicatorProfilesReplaceResultSchema),
  "/api/v1/custom-indicators/profiles/save": desktopCustomIndicatorProfileSaveResultSchema,
  "/api/v1/custom-indicators/profiles/delete": desktopCustomIndicatorProfileDeleteResultSchema,
  "/api/v1/custom-indicators/compile": desktopCustomIndicatorCompileResultSchema,
  "/api/v1/custom-indicators/execute": desktopCustomIndicatorExecuteResultSchema,
  "/api/v1/backtest/batches": desktopBacktestBatchListSchema
    .or(desktopBacktestBatchSchema)
    .or(desktopBacktestClearResultSchema),
  "/api/v1/backtest/batches/:id": desktopBacktestBatchSchema
    .or(desktopBacktestDeleteResultSchema),
  "/api/v1/backtest/batches/:id/run": desktopBacktestBatchSchema,
  "/api/v1/backtest/batches/:id/cancel": desktopBacktestBatchSchema,
  "/api/v1/backtest/batches/:id/progress": desktopBacktestProgressSchema,
  "/api/v1/backtest/batches/:id/results": desktopBacktestResultsSchema,
  "/api/v1/backtest/batches/:id/results/:symbol/trades": desktopBacktestResultDetailSchema,
} as const;

// This route-schema map is generated by tools/contracts/generate-openapi-contracts.mjs.
export const DESKTOP_LOCAL_REQUEST_SCHEMAS = {
  "/api/v1/system/startup-local-data/reinitialize": desktopStartupLocalDataReinitializeRequestSchema,
  "/api/v1/system/portable-export/preview": desktopPortableExportPreviewRequestSchema,
  "/api/v1/system/portable-export": desktopPortableExportRequestSchema,
  "/api/v1/system/local-import-mock-sample/export": desktopLocalImportMockSampleExportRequestSchema,
  "/api/v1/system/portable-import/inspect": desktopPortableImportInspectRequestSchema,
  "/api/v1/system/portable-import": desktopPortableImportRequestSchema,
  "/api/v1/training/free-replay/sessions": desktopSessionCreateRequestSchema,
  "/api/v1/training/free-replay/sessions/bootstrap": desktopSessionBootstrapRequestSchema,
  "/api/v1/training/free-replay/sessions/:id/trading-settings": desktopSessionTradingSettingsUpdateRequestSchema,
  "/api/v1/training/free-replay/sessions/:id/actions": desktopSessionActionRequestSchema,
  "/api/v1/training/free-replay/sessions/:id/order/quote": desktopSessionOrderQuoteRequestSchema,
  "/api/v1/training/free-replay/sessions/start": desktopPreparedFreeReplayStartRequestSchema,
  "/api/v1/training/free-replay/prep-read-model": desktopFreeReplayPrepReadModelRequestSchema,
  "/api/v1/training/free-replay/start-readiness": desktopFreeReplayStartReadinessRequestSchema,
  "/api/v1/training/free-replay/start-point-overview": desktopFreeReplayStartPointOverviewRequestSchema,
  "/api/v1/training/free-replay/pool-default-environments/:poolId": desktopFreeReplayPoolDefaultEnvironmentSchema,
  "/api/v1/training/special/challenges/start": desktopSpecialTrainingChallengeStartRequestSchema,
  "/api/v1/training/special/challenges/:challengeId/activity": desktopSpecialTrainingChallengeActivityRequestSchema,
  "/api/v1/training/special/challenges/:challengeId/order/quote": desktopSpecialTrainingOrderQuoteRequestSchema,
  "/api/v1/training/special/challenges/:challengeId/actions": desktopSpecialTrainingChallengeActionRequestSchema,
  "/api/v1/training/special/challenges/:challengeId/decision": desktopSpecialTrainingDecisionRequestSchema,
  "/api/v1/training/special/challenges/:challengeId/questions/:questionId/settle": desktopSpecialTrainingQuestionSettleRequestSchema,
  "/api/v1/training/special/question-bank/preview": desktopSpecialTrainingQuestionBankPreviewRequestSchema,
  "/api/v1/training/special/question-bank/draft-preview": desktopSpecialTrainingQuestionBankDraftPreviewRequestSchema,
  "/api/v1/training/special/bank-editor/read-model": desktopSpecialTrainingBankEditorReadModelRequestSchema,
  "/api/v1/training/special/question-bank/reset": desktopSpecialTrainingQuestionBankResetRequestSchema,
  "/api/v1/data-sources/acquisition-jobs": desktopMarketDataAcquisitionJobCreateRequestSchema,
  "/api/v1/data-sources/acquisition-market-jobs": desktopMarketDataAcquisitionMarketJobCreateRequestSchema,
  "/api/v1/data-sources/import/from-paths": desktopLocalDataImportByPathRequestSchema,
  "/api/v1/data-sources/import/preview/from-path": desktopLocalDataImportPreviewByPathRequestSchema,
  "/api/v1/data-sources/import/preview/discard": desktopLocalDataImportPreviewDiscardRequestSchema,
  "/api/v1/data-sources/import/preview/validate": desktopLocalDataImportDraftValidationRequestSchema,
  "/api/v1/data-sources/import-jobs/:jobId/control": desktopLocalDataImportControlRequestSchema,
  "/api/v1/data-sources/:sourceId/incremental-update/from-paths": desktopLocalDataIncrementalUpdateByPathRequestSchema,
  "/api/v1/data-sources/:sourceId/full-reimport/from-paths": desktopLocalDataFullReimportByPathRequestSchema,
  "/api/v1/data-sources/:sourceId/trading-calendar": desktopLocalDataSourceTradingCalendarUpdateRequestSchema,
  "/api/v1/data-sources/:sourceId/sync-preview/from-paths": desktopLocalDataSyncPreviewByPathRequestSchema,
  "/api/v1/data-sources/:sourceId/sync-quick-check/from-metadata": desktopLocalDataSyncQuickCheckByMetadataRequestSchema,
  "/api/v1/data-sources/:sourceId/diagnostic-profile": desktopLocalDataSourceDiagnosticProfileUpdateRequestSchema,
  "/api/v1/data-sources/:sourceId/symbols/remove": desktopLocalDataSourceRemoveSymbolsRequestSchema,
  "/api/v1/custom-indicators/profiles": desktopCustomIndicatorProfilesReplaceRequestSchema,
  "/api/v1/custom-indicators/profiles/save": desktopCustomIndicatorProfileSaveRequestSchema,
  "/api/v1/custom-indicators/profiles/delete": desktopCustomIndicatorProfileDeleteRequestSchema,
  "/api/v1/custom-indicators/compile": desktopCustomIndicatorCompileRequestSchema,
  "/api/v1/custom-indicators/execute": desktopCustomIndicatorExecuteRequestSchema,
  "/api/v1/backtest/batches": desktopBacktestBatchCreateRequestSchema,
  "/api/v1/backtest/batches/:id/run": desktopBacktestBatchRunRequestSchema,
} as const;

export type DesktopSystemHealth = z.infer<typeof desktopSystemHealthSchema>;
export type DesktopSecurityIntegrity = z.infer<
  typeof desktopSecurityIntegritySchema
>;
export type DesktopSystemStartupStatus = z.infer<
  typeof desktopSystemStartupStatusSchema
>;
export type DesktopStartupLocalDataReinitializeRequest = z.infer<
  typeof desktopStartupLocalDataReinitializeRequestSchema
>;
export type DesktopStartupLocalDataReinitializeResult = z.infer<
  typeof desktopStartupLocalDataReinitializeResultSchema
>;
export type DesktopLocalImportMockSampleExportRequest = z.infer<
  typeof desktopLocalImportMockSampleExportRequestSchema
>;
export type DesktopLocalImportMockSampleExportResult = z.infer<
  typeof desktopLocalImportMockSampleExportResultSchema
>;
export type DesktopInstrument = z.infer<typeof desktopInstrumentSchema>;
export type DesktopBarsRange = z.infer<typeof desktopBarsRangeSchema>;
export type DesktopMarketBarFrame = z.infer<typeof desktopMarketBarFrameSchema>;
export type DesktopWorkspaceId = z.infer<typeof desktopWorkspaceIdSchema>;
export type DesktopBacktestSignalRuleOperand = z.infer<
  typeof desktopBacktestSignalRuleOperandSchema
>;
export type DesktopBacktestSignalRuleOperator = z.infer<
  typeof desktopBacktestSignalRuleOperatorSchema
>;
export type DesktopBacktestSignalRuleCondition = z.infer<
  typeof desktopBacktestSignalRuleConditionSchema
>;
export type DesktopBacktestDirectionSignalRule = z.infer<
  typeof desktopBacktestDirectionSignalRuleSchema
>;
export type DesktopBacktestSignalRules = z.infer<
  typeof desktopBacktestSignalRulesSchema
>;
export type DesktopBacktestConfig = z.infer<typeof desktopBacktestConfigSchema>;
export type DesktopWorkspaceReadModelTone = z.infer<
  typeof desktopWorkspaceReadModelToneSchema
>;
export type DesktopWorkspaceReadModelAction = z.infer<
  typeof desktopWorkspaceReadModelActionSchema
>;
export type DesktopWorkspaceReadModelSection = z.infer<
  typeof desktopWorkspaceReadModelSectionSchema
>;
export type DesktopWorkspaceReadModel = z.infer<
  typeof desktopWorkspaceReadModelSchema
>;
export type DesktopCustomIndicatorProfile = z.infer<
  typeof desktopCustomIndicatorProfileSchema
>;
export type DesktopCustomIndicatorProfilesReplaceRequest = z.infer<
  typeof desktopCustomIndicatorProfilesReplaceRequestSchema
>;
export type DesktopCustomIndicatorProfilesReplaceResult = z.infer<
  typeof desktopCustomIndicatorProfilesReplaceResultSchema
>;
export type DesktopCustomIndicatorProfileSaveRequest = z.infer<
  typeof desktopCustomIndicatorProfileSaveRequestSchema
>;
export type DesktopCustomIndicatorProfileSaveResult = z.infer<
  typeof desktopCustomIndicatorProfileSaveResultSchema
>;
export type DesktopCustomIndicatorProfileDeleteRequest = z.infer<
  typeof desktopCustomIndicatorProfileDeleteRequestSchema
>;
export type DesktopCustomIndicatorProfileDeleteResult = z.infer<
  typeof desktopCustomIndicatorProfileDeleteResultSchema
>;
export type DesktopCustomIndicatorCompiledPayload = z.infer<
  typeof desktopCustomIndicatorCompiledPayloadSchema
>;
export type DesktopCustomIndicatorCompileRequest = z.infer<
  typeof desktopCustomIndicatorCompileRequestSchema
>;
export type DesktopCustomIndicatorCompileResult = z.infer<
  typeof desktopCustomIndicatorCompileResultSchema
>;
export type DesktopCustomIndicatorExecuteRequest = z.infer<
  typeof desktopCustomIndicatorExecuteRequestSchema
>;
export type DesktopCustomIndicatorExecuteResult = z.infer<
  typeof desktopCustomIndicatorExecuteResultSchema
>;
export type DesktopSession = z.infer<typeof desktopSessionSchema>;
export type DesktopSessionSnapshot = z.infer<
  typeof desktopSessionSnapshotSchema
>;
export type DesktopSessionBootstrap = z.infer<
  typeof desktopSessionBootstrapSchema
>;
export type DesktopLocalDataSourceSummary = z.infer<
  typeof desktopLocalDataSourceSummarySchema
>;
export type DesktopLocalDataImportJob = z.infer<
  typeof desktopLocalDataImportJobSchema
>;
export type DesktopResetAllDataModuleProgress = z.infer<
  typeof desktopResetAllDataModuleProgressSchema
>;
export type DesktopResetAllDataResult = z.infer<
  typeof desktopResetAllDataResultSchema
>;
export type DesktopResetAllDataJob = z.infer<
  typeof desktopResetAllDataJobSchema
>;
