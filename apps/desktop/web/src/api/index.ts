// SPDX-License-Identifier: GPL-3.0-only

import { createSpecialTrainingApi } from "@/api/specialTraining";
import { createTrainingRuntimeApi } from "@/api/trainingRuntime";
import { createLocalDataApi } from "@/api/localData";
import { createSystemApi } from "@/api/system";
export {
  followSystemStorageUntilFresh,
  getSystemStorageFollowupDelayMs,
} from "@/api/systemStorageFollowup";
import { createPortableDataApi } from "@/api/portableData";
import { createCustomIndicatorsApi } from "@/api/customIndicators";
import { createBacktestApi } from "@/api/backtest";
import { createMarketDataAcquisitionApi } from "@/api/marketDataAcquisition";
import { createWorkspaceReadModelsApi } from "@/api/workspaces";
import { createReplayNotesApi } from "@/api/replayNotes";
import {
  constrainReplayArchiveRecordForFrontend,
  createTrainingHistoryApi,
} from "@/api/history";
import { request } from "@/api/backendRequest";
import { getDesktopAppVersion } from "@/api/desktopAppVersion";
import {
  notifyDesktopMainWindowReadyToShow,
  subscribeDesktopMainWindowCloseRequested,
} from "@/api/desktopViewport";
import {
  DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES,
  closeCurrentDesktopSecondaryWindow,
  closeDesktopSecondaryWindow,
  getDesktopSecondaryWindowCurrentRevision,
  hideDesktopAppToTray,
  isCurrentDesktopSecondaryWindowAction,
  isDesktopSecondaryWindowAlive,
  isDesktopSecondaryWindowLifecycleAction,
  notifyDesktopSecondaryWindowContentReady,
  notifyDesktopSecondaryWindowDispose,
  notifyDesktopSecondaryWindowHiddenForReuse,
  notifyDesktopSecondaryWindowReady,
  notifyDesktopSecondaryWindowRouteReady,
  notifyDesktopSecondaryWindowShellReady,
  openDesktopSecondaryWindow,
  positionDesktopOnboardingSidecar,
  publishDesktopSecondaryWindowState,
  quitDesktopApp,
  resizeCurrentDesktopSecondaryWindowToGeometry,
  sendDesktopSecondaryWindowAction,
  sendDesktopSecondaryWindowActionAck,
  sendDesktopSecondaryWindowRouteAction,
  sendDesktopSecondaryWindowRouteActionWithAck,
  setDesktopSecondaryWindowVisualContext,
  subscribeDesktopSecondaryWindowActions,
  subscribeDesktopSecondaryWindowReuseCloseRequest,
  subscribeDesktopSecondaryWindowState,
  waitForDesktopSecondaryWindowVisibleReady,
  warmDesktopSecondaryWindow,
} from "@/api/desktopSecondaryWindows";
import {
  getNativeBackendStartupPreflightStatus,
  getNativeDesktopReleaseChannel,
  openMarketDataAcquisitionTermsUrl,
  openLocalPath,
  authorizeMarketDataAcquisitionFolder,
  cancelCsvFolderStagingNative,
  commitMarketDataAcquisitionOutput,
  discardCsvFolderStagingNative,
  pickMarketDataAcquisitionFolderPath,
  pickLocalImportMockSampleArchiveTargetPath,
  pickPortableExportTargetPath,
  pickPortableImportPackagePath,
  restartDesktopApp,
  saveCustomIndicatorAiConversionGuide,
  stageCsvFolderForImportNative,
  subscribeToDesktopMenuCommands,
  subscribeToNativeBackendStartupPreflightStatus,
  syncNativeDesktopUiLanguage,
} from "@/api/desktopNativeCommands";

export type {
  DesktopSecondaryWindowGeometry,
  DesktopSecondaryWindowKind,
  DesktopSecondaryWindowZoomBase,
  DesktopWindowZoomBase,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
export type {
  DesktopSecondaryWindowStatePayload,
  DesktopSecondaryWindowVisualContext,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
export {
  DESKTOP_SECONDARY_WINDOW_QUERY_PARAM,
  DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
  DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM,
  isDesktopSecondaryWindowKind,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
export {
  resolveDesktopSecondaryWindowGeometry,
  resolveDesktopSecondaryWindowZoomBase,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
export type {
  ApiTrainingProjectSummary,
  ApiTrainingProjectDetail,
  ApiTrainingProject,
  ApiTrainingProjectArchiveFromSessionPayload,
  ApiTrainingStatsComparisonMetrics,
  ApiTrainingStatsReport,
  ApiTrainingStatsSummary,
  ApiReplayRatioState,
  ApiTrainingReviewContext,
  ApiTrainingReviewWindow,
  ApiTrainingReviewDiagnosticsPayload,
  ApiTrainingReviewBundlePayload,
  ApiTrainingReviewReportSessionMetric,
  ApiTrainingReviewReportPayload,
  ApiTrainingReviewTrendReasonKey,
  ApiTrainingReviewTrendFacts,
} from "@/api/history";
export type {
  ApiSpecialTrainingModeId,
  ApiSpecialTrainingDurationEstimateBasis,
  ApiSpecialTrainingDurationEstimateOperatorMode,
  ApiSpecialTrainingDurationEstimateRequest,
  ApiSpecialTrainingDurationEstimateResponse,
  ApiSpecialTrainingFastDecisionChoice,
  ApiSpecialTrainingFastDecisionStrictnessLevel,
  ApiSpecialTrainingFeedbackCode,
  ApiSpecialTrainingBank,
  ApiSpecialTrainingBankPage,
  ApiSpecialTrainingBankScopeSummary,
  ApiSpecialTrainingTradeAction,
  ApiSpecialTrainingOrderBlockReasonCode,
  ApiSpecialTrainingOrderEstimate,
  ApiSpecialTrainingOrderInputMode,
  ApiSpecialTrainingOrderPriceMode,
  ApiSpecialTrainingOrderQuote,
  ApiSpecialTrainingOrderQuotePayload,
  ApiSpecialTrainingQuestion,
  ApiSpecialTrainingScopeRestartSignal,
  ApiSpecialTrainingChallenge,
  ApiSpecialTrainingQuestionBankSummary,
  ApiSpecialTrainingRiskCurvePoint,
  ApiSpecialTrainingRiskReviewEquityCurves,
  ApiSpecialTrainingRiskReviewCostBasisShift,
  ApiSpecialTrainingRiskReview,
  ApiSpecialTrainingChallengeProgress,
  ApiSpecialTrainingChallengeRuntime,
  ApiSpecialTrainingChallengeActivityResult,
  ApiSpecialTrainingChallengeCommandResult,
  ApiSpecialTrainingChallengeDiscardResult,
  ApiSpecialTrainingRiskActionBlockReasonCode,
  ApiSpecialTrainingRiskActionState,
  ApiSpecialTrainingRiskRuntimeBaseline,
  ApiSpecialTrainingRiskRuntimeMetrics,
  ApiSpecialTrainingFastDecisionTimerState,
  ApiSpecialTrainingQuestionBankActionAvailability,
  ApiSpecialTrainingQuestionBankActionFacts,
  ApiSpecialTrainingQuestionBankRuntimeFacts,
  ApiSpecialTrainingQuestionBankCapacityFacts,
  ApiSpecialTrainingSettlement,
  ApiSpecialTrainingHistoryQuestionSummary,
  ApiSpecialTrainingHistoryQuestionDetail,
  ApiSpecialTrainingFastDecisionSessionSummary,
  ApiSpecialTrainingFastDecisionSessionPresentation,
  ApiSpecialTrainingSessionGrade,
  ApiSpecialTrainingSessionGradeTone,
  ApiSpecialTrainingSessionMetricTone,
  ApiSpecialTrainingRiskBehaviorType,
  ApiSpecialTrainingRiskBehaviorSummary,
  ApiSpecialTrainingRiskDisciplineSessionSummary,
  ApiSpecialTrainingSessionSummary,
  ApiSpecialTrainingHistorySessionListItem,
  ApiSpecialTrainingHistorySessionDetail,
  ApiSpecialTrainingBankEditorPoolReasonCode,
  ApiSpecialTrainingBankEditorReadModel,
  ApiSpecialTrainingBankEditorReadModelRequest,
  ApiSpecialTrainingBankEditorReadiness,
  ApiSpecialTrainingBankEditorReasonCode,
  ApiSpecialTrainingBankEditorStep,
  ApiChallengeStatsDashboardFastDirectionSelection,
  ApiChallengeStatsRiskBehaviorType,
  ApiChallengeStatsReviewGrade,
  ApiChallengeStatsDashboardFastSessionRow,
  ApiChallengeStatsDashboardRiskSessionRow,
  ApiChallengeStatsDashboardSessionRow,
  ApiChallengeStatsDashboardInsights,
  ApiSpecialTrainingStatsReport,
  ApiSpecialTrainingStatsPayload,
  ApiSpecialTrainingStatsSummary,
  ApiChallengeStatsProjectReplay,
  ApiChallengeStatsProjectDetail,
} from "@/api/specialTraining";
export type {
  ApiReplayNoteType,
  ApiReplayNoteColorToken,
  ApiReplayNoteScopeFilter,
  ApiReplayNoteSummary,
  ApiReplayNoteDetail,
  ApiReplayNote,
  ApiRecentReplayNoteSummary,
} from "@/api/replayNotes";
export type {
  ApiDesktopLegalDocument,
  ApiHistoryRetentionImpact,
  ApiHistoryRetentionImpactSummary,
  ApiHistoryRetentionJob,
  ApiHistoryRetentionPolicy,
  ApiHistoryRetentionPreview,
  ApiHistoryRetentionTargets,
  ApiHistoryRetentionWindow,
  ApiLocalImportMockSampleExportResult,
} from "@/api/system";
export type {
  CsvFolderStagingMode,
  CsvFolderStagingProgress,
  CsvFolderStagingProgressPhase,
  CsvFolderStagingResult,
  DesktopMenuCommand,
  NativeBackendStartupPreflightStatus,
  NativeDesktopReleaseChannel,
} from "@/api/desktopNativeCommands";
export type {
  DesktopMainWindowCloseRequestEvent,
  DesktopViewportBootstrapState,
  DesktopViewportLayoutMode,
} from "@/api/desktopViewport";
export type {
  DesktopOnboardingSidecarTargetRect,
  DesktopSecondaryWindowActionAckPayload,
  DesktopSecondaryWindowActionPayload,
  DesktopSecondaryWindowSyncMode,
  DesktopSecondaryWindowSyncPolicy,
  OpenDesktopSecondaryWindowInput,
} from "@/api/desktopSecondaryWindows";
export {
  hasTauriRuntimeBridge,
  isTauriRuntime,
  loadTauriCoreModule,
  loadTauriOpenerModule,
} from "@/api/desktopNativeBridge";
export {
  applyDesktopWebviewZoom,
  bootstrapInitialMainDesktopViewport,
  bootstrapMainDesktopViewport,
  buildBrowserDesktopViewportState,
  cacheMainDesktopViewportState,
  notifyDesktopMainWindowReadyToShow,
  readMainDesktopViewportState,
  resetDesktopWebviewZoom,
  resolveBrowserDesktopViewportScale,
  resolveDesktopViewportLayoutMode,
  subscribeDesktopMainWindowCloseRequested,
  subscribeDesktopViewportChanges,
} from "@/api/desktopViewport";
export { getDesktopAppVersion } from "@/api/desktopAppVersion";
export {
  closeCurrentDesktopWindow,
  createDesktopWindowChromeAdapter,
  minimizeCurrentDesktopWindow,
  readCurrentDesktopWindowMaximized,
  readDesktopWindowChromePlatform,
  resolveDesktopWindowChromePlatform,
  shouldUseCustomDesktopWindowChrome,
  subscribeCurrentDesktopWindowMaximized,
  syncCurrentDesktopWindowTheme,
  toggleCurrentDesktopWindowMaximized,
  type DesktopWindowChromePlatform,
  type DesktopWindowChromeAdapter,
  type DesktopWindowPlatformSnapshot,
  type DesktopWindowTheme,
} from "@/api/desktopWindowChrome";
export {
  DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES,
  closeCurrentDesktopSecondaryWindow,
  closeDesktopSecondaryWindow,
  disposeDesktopSecondaryWindowListeners,
  getDesktopSecondaryWindowCurrentRevision,
  getDesktopSecondaryWindowLabel,
  hideDesktopAppToTray,
  isCurrentDesktopSecondaryWindowAction,
  isDesktopSecondaryWindowAlive,
  isDesktopSecondaryWindowLifecycleAction,
  notifyDesktopSecondaryWindowContentReady,
  notifyDesktopSecondaryWindowDispose,
  notifyDesktopSecondaryWindowHiddenForReuse,
  notifyDesktopSecondaryWindowReady,
  notifyDesktopSecondaryWindowRouteReady,
  notifyDesktopSecondaryWindowShellReady,
  openDesktopSecondaryWindow,
  positionDesktopOnboardingSidecar,
  publishDesktopSecondaryWindowState,
  quitDesktopApp,
  resizeCurrentDesktopSecondaryWindowToGeometry,
  sendDesktopSecondaryWindowAction,
  sendDesktopSecondaryWindowActionAck,
  sendDesktopSecondaryWindowRouteAction,
  sendDesktopSecondaryWindowRouteActionWithAck,
  setDesktopSecondaryWindowVisualContext,
  subscribeDesktopSecondaryWindowActions,
  subscribeDesktopSecondaryWindowReuseCloseRequest,
  subscribeDesktopSecondaryWindowState,
  waitForDesktopSecondaryWindowVisibleReady,
  warmDesktopSecondaryWindow,
} from "@/api/desktopSecondaryWindows";
export {
  getNativeBackendStartupPreflightStatus,
  getNativeDesktopReleaseChannel,
  cancelCsvFolderStagingNative,
  discardCsvFolderStagingNative,
  listenCsvFolderStagingProgress,
  restartDesktopApp,
  stageCsvFolderForImportNative,
  subscribeToNativeBackendStartupPreflightStatus,
  syncNativeDesktopUiLanguage,
} from "@/api/desktopNativeCommands";

const trainingHistoryApi = createTrainingHistoryApi(request);
const specialTrainingApi = createSpecialTrainingApi(request);
const replayNotesApi = createReplayNotesApi(request);
const trainingRuntimeApi = createTrainingRuntimeApi(request);
const localDataApi = createLocalDataApi(request);
const systemApi = createSystemApi(request);
const portableDataApi = createPortableDataApi(request);
const customIndicatorsApi = createCustomIndicatorsApi(request);
const backtestApi = createBacktestApi(request);
const marketDataAcquisitionApi = createMarketDataAcquisitionApi(request);
const workspaceReadModelsApi = createWorkspaceReadModelsApi(request);

const constrainReplayNoteContextReplayForFrontend = <TNote extends object>(
  note: TNote,
): TNote => {
  const record = note as TNote & { contextReplay?: unknown };
  if (
    !record.contextReplay ||
    typeof record.contextReplay !== "object" ||
    Array.isArray(record.contextReplay)
  ) {
    return note;
  }
  const contextReplay = constrainReplayArchiveRecordForFrontend(
    record.contextReplay as Record<string, unknown>,
  );
  return contextReplay === record.contextReplay
    ? note
    : {
        ...note,
        contextReplay: contextReplay ?? null,
      };
};

const boundedReplayNotesApi = {
  ...replayNotesApi,
  listReplayNotes: async (
    ...args: Parameters<typeof replayNotesApi.listReplayNotes>
  ) => {
    const page = await replayNotesApi.listReplayNotes(...args);
    return {
      ...page,
      items: page.items.map(constrainReplayNoteContextReplayForFrontend),
    };
  },
  getReplayNote: async (
    ...args: Parameters<typeof replayNotesApi.getReplayNote>
  ) =>
    constrainReplayNoteContextReplayForFrontend(
      await replayNotesApi.getReplayNote(...args),
    ),
  createReplayNote: async (
    ...args: Parameters<typeof replayNotesApi.createReplayNote>
  ) =>
    constrainReplayNoteContextReplayForFrontend(
      await replayNotesApi.createReplayNote(...args),
    ),
  updateReplayNote: async (
    ...args: Parameters<typeof replayNotesApi.updateReplayNote>
  ) =>
    constrainReplayNoteContextReplayForFrontend(
      await replayNotesApi.updateReplayNote(...args),
    ),
};

export type { ApiRequester, ApiRequestOptions } from "@/api/requesterTypes";
export type {
  ApiFreeReplayEnvironmentRuleCard,
  ApiInstrumentListOptions,
  ApiFreeReplayPrepPool,
  ApiFreeReplayPrepReadModel,
  ApiFreeReplayPoolDefaultEnvironment,
  ApiFreeReplayPoolDefaultEnvironmentById,
} from "@/api/trainingRuntime";
export type {
  ApiLocalDataImportFolderPreview,
  ApiLocalDataImportDraftValidation,
  ApiLocalDataImportPlanning,
  ApiLocalDataImportJob,
  ApiLocalDataImportPreviewJob,
  ApiLocalDataImportPreviewJobStage,
  ApiLocalDataImportSymbolLimit,
  ApiLocalDataSourceDiagnostics,
  ApiLocalDataSourceSummary,
  ApiLocalDataSourceSymbolDiagnostics,
  ApiTradingCalendarConfig,
  ApiTradingCalendarSuggestion,
  ApiTradingSessionRange,
  ApiLocalDataSyncPreview,
  ApiLocalDataSyncQuickCheck,
} from "@/api/localData";
export { normalizeApiTradingCalendarConfig } from "@/api/localData";
export type {
  ApiDesktopWorkspaceId,
  ApiDesktopWorkspaceReadModel,
  ApiHistoryReviewConsoleQuery,
  ApiSpecialTrainingModeParameterFacts,
  ApiSpecialTrainingWorkspaceFacts,
  ApiWorkspaceReadModelAction,
} from "@/api/workspaces";
export type {
  ApiAppPreferences,
  ApiResetAllStoredDataJob,
  ApiResetAllStoredDataModuleProgress,
  ApiResetAllStoredDataResult,
  ApiSystemDevSimulationCapabilities,
  ApiSystemDevSimulationCleanupJob,
  ApiSystemDevSimulationCleanupResult,
  ApiSystemDevSimulationJob,
  ApiStartupLocalDataReinitializeResult,
  ApiSystemStartupStatus,
  ApiSystemStorageSummary,
  ApiSystemStorageUsage,
} from "@/api/system";
export type {
  PortableDateRangeFilter,
  PortableDomainPreview,
  PortableExportDomain,
  PortableExportManifest,
  PortableExportPreview,
  PortableExportResult,
  PortableImportConflictMode,
  PortableImportSettingsConflictMode,
  PortableImportPreview,
  PortableImportPreviewDomain,
  PortableImportResult,
  PortableMarketSourcePreview,
  PortableSnapshotPolicy,
  ReplayAvailability,
} from "@/api/portableData";
export type {
  ApiCompiledScriptState,
  ApiCompileCustomIndicatorScriptRequest,
  ApiCompileCustomIndicatorScriptResult,
  ApiExecuteCustomIndicatorScriptRequest,
  ApiSavedIndicatorProfile,
  ApiSavedIndicatorProfileRevision,
} from "@/api/customIndicators";
export type {
  ApiBacktestBar,
  ApiBacktestBatch,
  ApiBacktestBatchCreateRequest,
  ApiBacktestBatchStatus,
  ApiBacktestClearResult,
  ApiBacktestConfig,
  ApiBacktestEquityPoint,
  ApiBacktestFill,
  ApiBacktestOrderSizing,
  ApiBacktestOrderSizingMode,
  ApiBacktestProgress,
  ApiBacktestResultDetail,
  ApiBacktestResultListItem,
  ApiBacktestResults,
  ApiBacktestResultSummary,
  ApiBacktestTradingSettings,
} from "@/api/backtest";
export type {
  AkshareAcquisitionInstrument,
  AkshareAcquisitionInstrumentCatalog,
  CcxtAcquisitionMarket,
  CcxtAcquisitionMarketCatalog,
  MarketDataAcquisitionConnector,
  MarketDataAcquisitionConnectorId,
  MarketDataAcquisitionCatalog,
  MarketDataAcquisitionAssetClass,
  MarketDataAcquisitionInstrument,
  MarketDataAcquisitionInstrumentCatalog,
  MarketDataAcquisitionJob,
  MarketDataAcquisitionJobList,
  MarketDataAcquisitionJobStage,
  MarketDataAcquisitionJobStatus,
  MarketDataAcquisitionJobSummary,
  MarketDataAcquisitionMarket,
  MarketDataAcquisitionMarketId,
  MarketDataAcquisitionMarketJob,
  MarketDataAcquisitionMarketRequest,
  MarketDataAcquisitionRequest,
  MarketDataAcquisitionSourcePlanId,
  MarketDataAcquisitionTimeframe,
} from "@/api/marketDataAcquisition";

export type { ApiError } from "@/api/error";
export {
  buildBoundedReplayBarsSnapshotWindow,
  constrainReplayArchiveRecordForFrontend,
} from "@/api/history";
export { toBackendErrorMessage } from "@/api/backendErrorMessage";
export {
  createApiError,
  hasApiErrorCode,
  isRetryableBackendTransportError,
} from "@/api/error";

export const api = {
  openMarketDataAcquisitionTermsUrl,
  openLocalPath,
  authorizeMarketDataAcquisitionFolder,
  cancelCsvFolderStagingNative,
  commitMarketDataAcquisitionOutput,
  discardCsvFolderStagingNative,
  pickMarketDataAcquisitionFolderPath,
  subscribeToDesktopMenuCommands,
  syncNativeDesktopUiLanguage,
  stageCsvFolderForImportNative,
  getNativeBackendStartupPreflightStatus,
  getNativeDesktopReleaseChannel,
  restartDesktopApp,
  saveCustomIndicatorAiConversionGuide,
  subscribeToNativeBackendStartupPreflightStatus,
  pickPortableExportTargetPath,
  pickLocalImportMockSampleArchiveTargetPath,
  pickPortableImportPackagePath,
  ...trainingRuntimeApi,
  ...systemApi,
  ...portableDataApi,
  ...localDataApi,
  ...workspaceReadModelsApi,
  ...trainingHistoryApi,
  ...specialTrainingApi,
  ...boundedReplayNotesApi,
  ...customIndicatorsApi,
  ...backtestApi,
  ...marketDataAcquisitionApi,
  getDesktopAppVersion,
  DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES,
  getDesktopSecondaryWindowCurrentRevision,
  isCurrentDesktopSecondaryWindowAction,
  isDesktopSecondaryWindowAlive,
  isDesktopSecondaryWindowLifecycleAction,
  setDesktopSecondaryWindowVisualContext,
  openDesktopSecondaryWindow,
  warmDesktopSecondaryWindow,
  publishDesktopSecondaryWindowState,
  positionDesktopOnboardingSidecar,
  resizeCurrentDesktopSecondaryWindowToGeometry,
  notifyDesktopSecondaryWindowReady,
  notifyDesktopSecondaryWindowShellReady,
  notifyDesktopSecondaryWindowRouteReady,
  notifyDesktopSecondaryWindowContentReady,
  notifyDesktopSecondaryWindowHiddenForReuse,
  notifyDesktopSecondaryWindowDispose,
  subscribeDesktopSecondaryWindowReuseCloseRequest,
  subscribeDesktopSecondaryWindowActions,
  subscribeDesktopSecondaryWindowState,
  waitForDesktopSecondaryWindowVisibleReady,
  sendDesktopSecondaryWindowAction,
  sendDesktopSecondaryWindowActionAck,
  sendDesktopSecondaryWindowRouteAction,
  sendDesktopSecondaryWindowRouteActionWithAck,
  closeCurrentDesktopSecondaryWindow,
  closeDesktopSecondaryWindow,
  hideDesktopAppToTray,
  notifyDesktopMainWindowReadyToShow,
  quitDesktopApp,
  subscribeDesktopMainWindowCloseRequested,
};
