// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useMemo, useRef } from "react";
import { api } from "@/api";
import {
  type CsvImportActionStartResult,
  type CsvPoolNamingStrategy,
} from "@/app-shell/appCsvImportContracts";
import { type UiSettings } from "@/frontend-kernel/appTypes";
import { getBaseTimeframeLabels, getCsvFieldLabels } from "@/frontend-kernel/uiOptions";
import { buildRuntimeCsvMappingModalProps } from "@/app-shell/runtime/workspace-shell/runtimeModalSectionBuilders";
import {
  beginCsvImportConfigWindowVisibilityGate,
  buildTerminalActionKey,
  buildTerminalRequestKey,
  createCsvImportConfigWindowReadinessRegistry,
  createTerminalActionAckSender,
  getImportStartRejectionText,
  type PendingMarketDataImportHandoff,
  waitForAcceptedMarketDataImportHandoff,
} from "@/app-shell/runtime/csvImportConfigWindowReadiness";
import {
  createDesktopSecondaryWindowActionAckLedger,
  isDesktopSecondaryWindowActionRequestRevisionCurrent,
  type DesktopSecondaryWindowActionRequestIdentity,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowActionAck";
import type { useRuntimeStartupState } from "@/app-shell/runtime/runtimeStartupState";
import type { useRuntimeStartupHistoryState } from "@/app-shell/runtime/runtimeStartupHistoryState";
import type { useRuntimeStartupPersistence } from "@/app-shell/runtime/runtimeStartupPersistence";
import type { useRuntimeTrainerChartSession } from "@/app-shell/runtime/runtimeTrainerChartSession";
import type { useRuntimeTrainerMarketSettings } from "@/app-shell/runtime/runtimeTrainerMarketSettings";
import type { useRuntimeTrainerPoolChartPipeline } from "@/app-shell/runtime/runtimeTrainerPoolChartPipeline";
import type { useRuntimeTrainerChartOrchestration } from "@/app-shell/runtime/runtimeTrainerChartOrchestration";
import type { useRuntimeFreeReplaySetup } from "@/app-shell/runtime/runtimeFreeReplaySetup";
import type { useRuntimeFreeReplayExecution } from "@/app-shell/runtime/runtimeFreeReplayExecution";
import type { useRuntimeTradingSettingsAndImport } from "@/app-shell/runtime/runtimeTradingSettingsAndImport";
import type { useRuntimeDataResetNavigation } from "@/app-shell/runtime/runtimeDataResetNavigation";
import type { useRuntimeNoteEditorAndShortcuts } from "@/app-shell/runtime/runtimeNoteEditorAndShortcuts";
import type { useRuntimeWorkspaceProps } from "@/app-shell/runtime/runtimeWorkspaceProps";
import type { useRuntimeWorkspaceBundles } from "@/app-shell/runtime/runtimeWorkspaceBundles";
type RuntimeHookScope = AppRootRuntimeProps &
  ReturnType<typeof useRuntimeStartupState> &
  ReturnType<typeof useRuntimeStartupHistoryState> &
  ReturnType<typeof useRuntimeStartupPersistence> &
  ReturnType<typeof useRuntimeTrainerChartSession> &
  ReturnType<typeof useRuntimeTrainerMarketSettings> &
  ReturnType<typeof useRuntimeTrainerPoolChartPipeline> &
  ReturnType<typeof useRuntimeTrainerChartOrchestration> &
  ReturnType<typeof useRuntimeFreeReplaySetup> &
  ReturnType<typeof useRuntimeFreeReplayExecution> &
  ReturnType<typeof useRuntimeTradingSettingsAndImport> &
  ReturnType<typeof useRuntimeDataResetNavigation> &
  ReturnType<typeof useRuntimeNoteEditorAndShortcuts> &
  ReturnType<typeof useRuntimeWorkspaceProps> &
  ReturnType<typeof useRuntimeWorkspaceBundles> &
  Record<string, unknown>;
export type AppRootRuntimeProps = {
  initialUiSettings: UiSettings;
  initialDataPoolRemovedSymbolsBySourceId: Record<string, string[]>;
  canPersistUiSettings: boolean;
};

const readMarketDataImportRequest = (
  value: unknown,
): { folderPath: string; sourceFolderBookmarkId?: string } | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const payload = value as Record<string, unknown>;
  const folderPath = String(payload.folderPath || "").trim();
  const sourceFolderBookmarkId = String(
    payload.sourceFolderBookmarkId || "",
  ).trim();
  return folderPath
    ? {
        folderPath,
        ...(sourceFolderBookmarkId ? { sourceFolderBookmarkId } : {}),
      }
    : null;
};

export const useRuntimeSecondaryWindows = (scope: RuntimeHookScope) => {
  const {
    availableTimeZones,
    cancelPendingCsvImport,
    confirmPendingCsvImport,
    isPreparingCsvImportPreview,
    pendingCsvFieldMapping,
    pendingCsvFolderImport,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    pendingCsvPlanConfigRows,
    pendingCsvPoolNamingStrategy,
    resetPendingCsvImportTimeZoneRecommendation,
    setError,
    tt,
    ttf,
    updatePendingCsvImportTimeZone,
    updatePendingCsvMapping,
    updatePendingCsvPlanPoolName,
    updatePendingCsvPlanSourceId,
    updatePendingCsvPoolNamingStrategy,
    updatePendingCsvTimestampMode,
  } = scope;
  const { openCsvFolderPathAndPrepareImport } = scope;
  const {
    confirmPendingCsvImportTimeZone,
    pendingCsvImportTimeZoneConfirmed,
    resetPendingCsvImportTradingCalendarRecommendation,
    updatePendingCsvImportTradingCalendar,
  } = scope;
  const importReadinessSummaryText = tt("appText.ready");
  const csvMappingModalArgs = buildRuntimeCsvMappingModalProps({
    pendingImport: pendingCsvFolderImport,
    pendingFieldMapping: pendingCsvFieldMapping,
    pendingPlanConfigRows: pendingCsvPlanConfigRows,
    pendingImportTimeZone: pendingCsvImportTimeZone,
    pendingImportTimeZoneMode: pendingCsvImportTimeZoneMode,
    pendingImportTimeZoneConfirmed: pendingCsvImportTimeZoneConfirmed,
    pendingImportScopeStrategy: pendingCsvPoolNamingStrategy,
    importReadinessSummaryText,
    availableTimeZones,
    isPreparingCsvImportPreview,
    getCsvFieldLabels,
    getBaseTimeframeLabels,
    tt,
    ttf,
    onPendingImportTimeZoneChange: updatePendingCsvImportTimeZone,
    onConfirmPendingImportTimeZone: confirmPendingCsvImportTimeZone,
    onResetPendingImportTimeZoneRecommendation:
      resetPendingCsvImportTimeZoneRecommendation,
    onPendingImportTradingCalendarChange: updatePendingCsvImportTradingCalendar,
    onResetPendingImportTradingCalendarRecommendation:
      resetPendingCsvImportTradingCalendarRecommendation,
    onPendingImportScopeStrategyChange: updatePendingCsvPoolNamingStrategy,
    onUpdatePendingCsvTimestampMode: updatePendingCsvTimestampMode,
    onUpdatePendingCsvMapping: updatePendingCsvMapping,
    onPendingPlanPoolNameChange: updatePendingCsvPlanPoolName,
    onPendingPlanSourceIdChange: updatePendingCsvPlanSourceId,
    onCancelPendingCsvImport: cancelPendingCsvImport,
    onConfirmPendingCsvImport: confirmPendingCsvImport,
  });
  const csvImportConfigWindowOpenedRef = useRef(false);
  const csvImportConfigWindowRevisionRef = useRef(0);
  const csvImportConfigWindowOperationGenerationRef = useRef(0);
  const csvImportConfigAcceptedCloseRequestIdRef = useRef("");
  const terminalActionAckLedgerRef = useRef(
    createDesktopSecondaryWindowActionAckLedger(),
  );
  const csvImportConfigWindowReadinessRef = useRef(
    createCsvImportConfigWindowReadinessRegistry(),
  );
  const pendingMarketDataImportHandoffRef =
    useRef<PendingMarketDataImportHandoff | null>(null);
  const desiredCsvImportPreviewTokenRef = useRef("");
  desiredCsvImportPreviewTokenRef.current = String(
    pendingCsvFolderImport?.previewToken || "",
  ).trim();
  const csvImportConfigActionHandlersRef = useRef({
    cancelPendingCsvImport,
    confirmPendingCsvImport,
    openCsvFolderPathAndPrepareImport,
    tt,
    confirmPendingCsvImportTimeZone,
    resetPendingCsvImportTimeZoneRecommendation,
    resetPendingCsvImportTradingCalendarRecommendation,
    updatePendingCsvImportTimeZone,
    updatePendingCsvImportTradingCalendar,
    updatePendingCsvMapping,
    updatePendingCsvPlanPoolName,
    updatePendingCsvPlanSourceId,
    updatePendingCsvPoolNamingStrategy,
    updatePendingCsvTimestampMode,
  });
  csvImportConfigActionHandlersRef.current = {
    cancelPendingCsvImport,
    confirmPendingCsvImport,
    openCsvFolderPathAndPrepareImport,
    tt,
    confirmPendingCsvImportTimeZone,
    resetPendingCsvImportTimeZoneRecommendation,
    resetPendingCsvImportTradingCalendarRecommendation,
    updatePendingCsvImportTimeZone,
    updatePendingCsvImportTradingCalendar,
    updatePendingCsvMapping,
    updatePendingCsvPlanPoolName,
    updatePendingCsvPlanSourceId,
    updatePendingCsvPoolNamingStrategy,
    updatePendingCsvTimestampMode,
  };
  const csvImportConfigWindowPayload = useMemo(() => {
    return {
      pendingImport: pendingCsvFolderImport,
      pendingFieldMapping: pendingCsvFieldMapping,
      pendingPlanConfigRows: pendingCsvPlanConfigRows,
      pendingImportTimeZone: pendingCsvImportTimeZone,
      pendingImportTimeZoneMode: pendingCsvImportTimeZoneMode,
      pendingImportTimeZoneConfirmed: pendingCsvImportTimeZoneConfirmed,
      pendingImportScopeStrategy: pendingCsvPoolNamingStrategy,
      importReadinessSummaryText,
      availableTimeZones,
      isPreparingCsvImportPreview,
      csvFieldLabels: getCsvFieldLabels(),
      baseTimeframeLabels: getBaseTimeframeLabels(),
    };
  }, [
    availableTimeZones,
    getBaseTimeframeLabels,
    getCsvFieldLabels,
    importReadinessSummaryText,
    isPreparingCsvImportPreview,
    pendingCsvFieldMapping,
    pendingCsvFolderImport,
    pendingCsvImportTimeZone,
    pendingCsvImportTimeZoneMode,
    pendingCsvImportTimeZoneConfirmed,
    pendingCsvPlanConfigRows,
    pendingCsvPoolNamingStrategy,
  ]);

  useEffect(() => {
    const operationGeneration =
      csvImportConfigWindowOperationGenerationRef.current + 1;
    csvImportConfigWindowOperationGenerationRef.current = operationGeneration;
    const readiness = csvImportConfigWindowReadinessRef.current;
    const readinessAbortController = new AbortController();
    const previewToken = String(
      pendingCsvFolderImport?.previewToken || "",
    ).trim();
    readiness.rejectExcept(
      previewToken,
      new Error(tt("appText.importConfigurationExpiredRescanFolder")),
    );
    if (!pendingCsvFolderImport) {
      csvImportConfigWindowOpenedRef.current = false;
      csvImportConfigWindowRevisionRef.current = 0;
      if (!csvImportConfigAcceptedCloseRequestIdRef.current) {
        void api
          .closeDesktopSecondaryWindow("SAMPLE_POOL_IMPORT_CONFIG")
          .catch(() => undefined);
      }
      return () => {
        readinessAbortController.abort();
      };
    }
    csvImportConfigAcceptedCloseRequestIdRef.current = "";
    const input = {
      kind: "SAMPLE_POOL_IMPORT_CONFIG" as const,
      title: tt("appText.samplePoolImportConfiguration"),
      payload: csvImportConfigWindowPayload,
    };
    const shouldOpenWindow = !csvImportConfigWindowOpenedRef.current;
    if (shouldOpenWindow) {
      csvImportConfigWindowOpenedRef.current = true;
    }
    const windowStateTask = shouldOpenWindow
      ? api.openDesktopSecondaryWindow(input)
      : api.publishDesktopSecondaryWindowState(input);
    void windowStateTask
      .then(async (state) => {
        if (
          csvImportConfigWindowOperationGenerationRef.current !==
            operationGeneration ||
          desiredCsvImportPreviewTokenRef.current !== previewToken ||
          readinessAbortController.signal.aborted
        ) {
          return;
        }
        const readyRevision = await beginCsvImportConfigWindowVisibilityGate(
          state.revision,
          (revision) => {
            csvImportConfigWindowRevisionRef.current = revision;
          },
          (revision) =>
            api.waitForDesktopSecondaryWindowVisibleReady(
              "SAMPLE_POOL_IMPORT_CONFIG",
              revision,
              {
                followLatestRevision: true,
                signal: readinessAbortController.signal,
              },
            ),
        );
        csvImportConfigWindowRevisionRef.current = readyRevision;
        if (
          csvImportConfigWindowOperationGenerationRef.current !==
            operationGeneration ||
          desiredCsvImportPreviewTokenRef.current !== previewToken ||
          readinessAbortController.signal.aborted
        ) {
          return;
        }
        readiness.resolve(previewToken, readyRevision);
      })
      .catch((error) => {
        if (
          readinessAbortController.signal.aborted ||
          csvImportConfigWindowOperationGenerationRef.current !==
            operationGeneration ||
          desiredCsvImportPreviewTokenRef.current !== previewToken
        ) {
          return;
        }
        csvImportConfigWindowOpenedRef.current = false;
        csvImportConfigWindowRevisionRef.current = 0;
        console.error(
          "[desktop-secondary-window] csv import config failed",
          error,
        );
        readiness.reject(
          previewToken,
          new Error(tt("appText.marketDataAcquisitionImportStartFailed")),
        );
        setError(tt("appText.import"));
      });
    return () => {
      readinessAbortController.abort();
    };
  }, [csvImportConfigWindowPayload, pendingCsvFolderImport, setError, tt]);
  useEffect(() => {
    const unsubscribe = api.subscribeDesktopSecondaryWindowActions(
      (message) => {
        const handlers = csvImportConfigActionHandlersRef.current;
        const payload =
          message.payload &&
          typeof message.payload === "object" &&
          !Array.isArray(message.payload)
            ? (message.payload as Record<string, unknown>)
            : {};

        if (
          message.kind === "MARKET_DATA_ACQUISITION" &&
          api.isDesktopSecondaryWindowLifecycleAction(message.action)
        ) {
          const pending = pendingMarketDataImportHandoffRef.current;
          if (pending) {
            pending.suppressAck = true;
            pendingMarketDataImportHandoffRef.current = null;
            pending.abortController.abort(
              new DOMException(
                "MARKET_DATA_IMPORT_HANDOFF_SOURCE_CLOSED",
                "AbortError",
              ),
            );
            if (pending.previewToken) {
              csvImportConfigWindowReadinessRef.current.reject(
                pending.previewToken,
                new Error(
                  handlers.tt("appText.marketDataAcquisitionImportStartFailed"),
                ),
              );
            }
            handlers.cancelPendingCsvImport();
            void api
              .closeDesktopSecondaryWindow("SAMPLE_POOL_IMPORT_CONFIG")
              .catch(() => undefined);
          }
          return;
        }

        const handleTerminalRequest = (
          action: "CONFIRM" | "REQUEST_IMPORT",
          start: (signal?: AbortSignal) => CsvImportActionStartResult,
        ): boolean => {
          if (message.action !== action) {
            return false;
          }
          const requestId = String(message.requestId || "").trim();
          if (!requestId) {
            return true;
          }
          const request: DesktopSecondaryWindowActionRequestIdentity = {
            kind: message.kind,
            action,
            instanceId: message.instanceId,
            requestId,
            stateRevision: message.stateRevision,
          };
          const ledger = terminalActionAckLedgerRef.current;
          const { deliver: deliverAck, send: sendAckForRequest } =
            createTerminalActionAckSender({
              closeMarketDataSource: () =>
                api.closeDesktopSecondaryWindow("MARKET_DATA_ACQUISITION"),
              fallbackFailureReason: handlers.tt(
                "appText.marketDataAcquisitionImportStartFailed",
              ),
              kind: message.kind,
              ledger,
              reportRejectedDeliveryFailure: setError,
              sendAck: (ack) =>
                api.sendDesktopSecondaryWindowActionAck({
                  ...ack,
                  kind: message.kind,
                }),
            });
          const cachedAck = ledger.findByRequest(request);
          if (cachedAck) {
            deliverAck(cachedAck);
            return true;
          }
          const duplicateAck = ledger.replayAcceptedForRequest(request);
          if (duplicateAck) {
            ledger.remember(duplicateAck);
            deliverAck(duplicateAck);
            return true;
          }

          const currentRevision = api.getDesktopSecondaryWindowCurrentRevision(
            message.kind,
          );
          if (
            !isDesktopSecondaryWindowActionRequestRevisionCurrent(
              message.stateRevision,
              currentRevision,
            )
          ) {
            sendAckForRequest(
              request,
              "REJECTED",
              "STALE_REVISION",
              action === "CONFIRM"
                ? handlers.tt("appText.importConfigurationExpiredRescanFolder")
                : handlers.tt("appText.marketDataAcquisitionImportStartFailed"),
            );
            return true;
          }

          if (action === "REQUEST_IMPORT") {
            const pending = pendingMarketDataImportHandoffRef.current;
            if (
              pending &&
              pending.actionKey === buildTerminalActionKey(request)
            ) {
              pending.requests.set(buildTerminalRequestKey(request), request);
              return true;
            }
            if (pending) {
              sendAckForRequest(
                request,
                "REJECTED",
                "ACTION_BLOCKED",
                handlers.tt("appText.systemProcessingWait"),
              );
              return true;
            }
          }

          const abortController = new AbortController();
          let result: CsvImportActionStartResult;
          try {
            result = start(abortController.signal);
          } catch {
            sendAckForRequest(
              request,
              "REJECTED",
              "ACTION_REJECTED",
              action === "CONFIRM"
                ? handlers.tt("appText.importPreviewFailed")
                : handlers.tt("appText.marketDataAcquisitionImportStartFailed"),
            );
            return true;
          }
          if (!result.accepted) {
            sendAckForRequest(
              request,
              "REJECTED",
              result.code === "IMPORT_BLOCKED"
                ? "ACTION_BLOCKED"
                : result.code === "INVALID_FOLDER"
                  ? "INVALID_REQUEST"
                  : result.code === "DUPLICATE_REQUEST"
                    ? "DUPLICATE_ACTION"
                    : "ACTION_REJECTED",
              getImportStartRejectionText(result, handlers.tt),
            );
            return true;
          }
          if (action === "REQUEST_IMPORT") {
            const completion = result.completion;
            if (!completion) {
              sendAckForRequest(
                request,
                "REJECTED",
                "ACTION_REJECTED",
                handlers.tt("appText.marketDataAcquisitionImportStartFailed"),
              );
              return true;
            }
            const pending: PendingMarketDataImportHandoff = {
              abortController,
              actionKey: buildTerminalActionKey(request),
              originalRequestId: requestId,
              previewToken: "",
              requests: new Map([[buildTerminalRequestKey(request), request]]),
              suppressAck: false,
            };
            pendingMarketDataImportHandoffRef.current = pending;
            void (async () => {
              try {
                const preparation =
                  await waitForAcceptedMarketDataImportHandoff({
                    completion,
                    failureReason: handlers.tt(
                      "appText.marketDataAcquisitionImportStartFailed",
                    ),
                    isActive: () =>
                      pendingMarketDataImportHandoffRef.current === pending &&
                      !pending.abortController.signal.aborted,
                    onPreviewPrepared: (readyPreparation) => {
                      pending.previewToken = readyPreparation.previewToken;
                    },
                    waitForConfigWindow: (previewToken) =>
                      csvImportConfigWindowReadinessRef.current.wait(
                        previewToken,
                      ),
                  });
                if (!preparation) {
                  return;
                }
                if (!pending.suppressAck) {
                  Array.from(pending.requests.values()).forEach(
                    (pendingRequest) => {
                      sendAckForRequest(
                        pendingRequest,
                        "ACCEPTED",
                        pendingRequest.requestId === pending.originalRequestId
                          ? "ACTION_ACCEPTED"
                          : "DUPLICATE_ACTION",
                      );
                    },
                  );
                }
              } catch (error) {
                if (
                  pendingMarketDataImportHandoffRef.current !== pending ||
                  pending.suppressAck
                ) {
                  return;
                }
                console.error(
                  "[market-data-acquisition] secondary-window handoff failed",
                  error,
                );
                const reason = handlers.tt(
                  "appText.marketDataAcquisitionImportStartFailed",
                );
                Array.from(pending.requests.values()).forEach(
                  (pendingRequest) => {
                    sendAckForRequest(
                      pendingRequest,
                      "REJECTED",
                      "ACTION_REJECTED",
                      reason,
                    );
                  },
                );
                handlers.cancelPendingCsvImport();
                void api
                  .closeDesktopSecondaryWindow("SAMPLE_POOL_IMPORT_CONFIG")
                  .catch(() => undefined);
              } finally {
                if (pendingMarketDataImportHandoffRef.current === pending) {
                  pendingMarketDataImportHandoffRef.current = null;
                }
                if (pending.previewToken) {
                  csvImportConfigWindowReadinessRef.current.delete(
                    pending.previewToken,
                  );
                }
              }
            })();
            return true;
          }
          if (action === "CONFIRM") {
            sendAckForRequest(request, "ACCEPTED", "ACTION_ACCEPTED");
            // The window closes itself after a successful confirm. Clear the
            // accepted-close marker so a later import state change can force
            // close a stale window instead of leaving it behind.
            csvImportConfigAcceptedCloseRequestIdRef.current = "";
            return true;
          }
          sendAckForRequest(request, "ACCEPTED", "ACTION_ACCEPTED");
          return true;
        };

        if (
          message.kind === "MARKET_DATA_ACQUISITION" &&
          handleTerminalRequest("REQUEST_IMPORT", (signal) => {
            const request = readMarketDataImportRequest(message.payload);
            if (!request) {
              return { accepted: false, code: "INVALID_FOLDER" };
            }
            return handlers.openCsvFolderPathAndPrepareImport(
              request.folderPath,
              {
                sourceFolderBookmarkId: request.sourceFolderBookmarkId,
                signal,
              },
            );
          })
        ) {
          return;
        }

        if (message.kind !== "SAMPLE_POOL_IMPORT_CONFIG") {
          return;
        }
        if (
          handleTerminalRequest("CONFIRM", () =>
            handlers.confirmPendingCsvImport({
              poolNameByPreviewPlanId:
                payload.poolNameByPreviewPlanId &&
                typeof payload.poolNameByPreviewPlanId === "object" &&
                !Array.isArray(payload.poolNameByPreviewPlanId)
                  ? Object.fromEntries(
                      Object.entries(payload.poolNameByPreviewPlanId).map(
                        ([planId, poolName]) => [
                          String(planId || "").trim(),
                          String(poolName ?? ""),
                        ],
                      ),
                    )
                  : undefined,
            }),
          )
        ) {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            api.getDesktopSecondaryWindowCurrentRevision(message.kind),
          )
        ) {
          return;
        }
        switch (message.action) {
          case "SET_TIME_ZONE":
            handlers.updatePendingCsvImportTimeZone(
              String(payload.timeZone || ""),
            );
            break;
          case "RESET_TIME_ZONE":
            handlers.resetPendingCsvImportTimeZoneRecommendation();
            break;
          case "SET_TRADING_CALENDAR":
            handlers.updatePendingCsvImportTradingCalendar(
              payload.tradingCalendar as Parameters<
                typeof handlers.updatePendingCsvImportTradingCalendar
              >[0],
            );
            break;
          case "RESET_TRADING_CALENDAR":
            handlers.resetPendingCsvImportTradingCalendarRecommendation();
            break;
          case "CONFIRM_TIME_ZONE":
            handlers.confirmPendingCsvImportTimeZone();
            break;
          case "SET_SCOPE_STRATEGY":
            handlers.updatePendingCsvPoolNamingStrategy(
              payload.strategy as CsvPoolNamingStrategy,
            );
            break;
          case "SET_TIMESTAMP_MODE":
            if (payload.mode === "SINGLE" || payload.mode === "SPLIT") {
              handlers.updatePendingCsvTimestampMode(payload.mode);
            }
            break;
          case "SET_FIELD_MAPPING":
            handlers.updatePendingCsvMapping(
              String(payload.field || "") as Parameters<
                typeof handlers.updatePendingCsvMapping
              >[0],
              String(payload.value ?? ""),
            );
            break;
          case "SET_PLAN_POOL_NAME":
            handlers.updatePendingCsvPlanPoolName(
              String(payload.planId || ""),
              String(payload.poolName ?? ""),
            );
            break;
          case "SET_PLAN_SOURCE_ID":
            handlers.updatePendingCsvPlanSourceId(
              String(payload.planId || ""),
              String(payload.sourceId ?? ""),
            );
            break;
          case "CANCEL":
          case "WINDOW_CLOSED":
            csvImportConfigAcceptedCloseRequestIdRef.current = "";
            handlers.cancelPendingCsvImport();
            break;
          default:
            break;
        }
      },
    );
    return () => {
      unsubscribe();
      const pending = pendingMarketDataImportHandoffRef.current;
      if (!pending) {
        return;
      }
      pending.suppressAck = true;
      pendingMarketDataImportHandoffRef.current = null;
      pending.abortController.abort(
        new DOMException("MARKET_DATA_IMPORT_HANDOFF_DISPOSED", "AbortError"),
      );
      if (pending.previewToken) {
        csvImportConfigWindowReadinessRef.current.reject(
          pending.previewToken,
          new Error("MARKET_DATA_IMPORT_HANDOFF_DISPOSED"),
        );
      }
    };
  }, []);
  return {
    csvImportConfigWindowOpenedRef,
    csvImportConfigWindowPayload,
    csvMappingModalArgs,
  };
};
