// SPDX-License-Identifier: GPL-3.0-only

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MARKET_DATA_ACQUISITION_ERROR_CODES } from "@zinuto/shared/contracts-desktop/api";

import {
  buildMarketDataAcquisitionMarketRequest,
  buildMarketDataAcquisitionRequest,
  resolveMarketDataAcquisitionDateIssues,
  resolveMarketDataAcquisitionErrorMessageKey,
} from "../../src/workspaces/data/dataConfig/marketDataAcquisitionModel";
import {
  createDesktopSecondaryWindowActionAckLedger,
  doesDesktopSecondaryWindowActionAckMatchRequest,
  isDesktopSecondaryWindowActionRequestRevisionCurrent,
  retryDesktopSecondaryWindowActionAckDelivery,
  waitForDesktopSecondaryWindowActionAck,
  type DesktopSecondaryWindowActionAck,
} from "../../src/frontend-kernel/secondary-windows/desktopSecondaryWindowActionAck.js";
import { createDesktopSecondaryWindowStateStore } from "../../src/frontend-kernel/secondary-windows/desktopSecondaryWindowManagerModel.js";
import { resolveCsvImportEntryBlockCode } from "../../src/app-shell/appCsvImportContracts.js";
import {
  beginCsvImportConfigWindowVisibilityGate,
  createCsvImportConfigWindowReadinessRegistry,
  createTerminalActionAckSender,
  waitForAcceptedMarketDataImportHandoff,
} from "../../src/app-shell/runtime/csvImportConfigWindowReadiness.js";

const acquisitionSectionSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketDataAcquisitionSection.tsx",
    import.meta.url,
  ),
  "utf8",
);
const acquisitionStatePageSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketDataAcquisitionStatePage.tsx",
    import.meta.url,
  ),
  "utf8",
);
const acquisitionActionBarsSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketDataAcquisitionActionBars.tsx",
    import.meta.url,
  ),
  "utf8",
);
const acquisitionWizardSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketDataAcquisitionWizard.tsx",
    import.meta.url,
  ),
  "utf8",
);
const dataSettingsMessagesSource = readFileSync(
  new URL(
    "../../../../../packages/shared/src/i18n/messages/data-settings.json",
    import.meta.url,
  ),
  "utf8",
);
const marketAcquisitionPickerSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketAcquisitionInstrumentPicker.tsx",
    import.meta.url,
  ),
  "utf8",
);
const marketAcquisitionPresentationSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/marketAcquisitionPresentation.ts",
    import.meta.url,
  ),
  "utf8",
);
const acquisitionResultSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketDataAcquisitionResult.tsx",
    import.meta.url,
  ),
  "utf8",
);
const acquisitionStylesSource = [
  "market-data-acquisition.layer-01.css",
  "market-data-acquisition.layer-02.css",
]
  .map((fileName) =>
    readFileSync(
      new URL(
        `../../src/workspaces/data/dataConfig/${fileName}`,
        import.meta.url,
      ),
      "utf8",
    ),
  )
  .join("\n");
const hallSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/DataConfigHallContent.tsx",
    import.meta.url,
  ),
  "utf8",
);
const acquisitionTriggerSource = readFileSync(
  new URL(
    "../../src/workspaces/data/dataConfig/MarketDataAcquisitionTriggerSection.tsx",
    import.meta.url,
  ),
  "utf8",
);
const secondaryDataRouteSource = readFileSync(
  new URL(
    "../../src/app-shell/secondaryWindows/routes/secondaryDataRoute.tsx",
    import.meta.url,
  ),
  "utf8",
);
const nativeCommandsSource = readFileSync(
  new URL("../../src/api/desktopNativeCommands.ts", import.meta.url),
  "utf8",
);
const importPreviewSource = readFileSync(
  new URL("../../src/app-shell/AppCsvMappingModal.tsx", import.meta.url),
  "utf8",
);
const importPreviewActionsSource = readFileSync(
  new URL("../../src/app-shell/appCsvImportPreviewActions.ts", import.meta.url),
  "utf8",
);
const runtimeSecondaryWindowsSource = readFileSync(
  new URL(
    "../../src/app-shell/runtime/runtimeSecondaryWindows.ts",
    import.meta.url,
  ),
  "utf8",
);
const desktopSecondaryWindowsSource = readFileSync(
  new URL("../../src/api/desktopSecondaryWindows.ts", import.meta.url),
  "utf8",
);
const desktopSecondaryWindowListenersSource = readFileSync(
  new URL("../../src/api/desktopSecondaryWindowListeners.ts", import.meta.url),
  "utf8",
);
const prohibitedCatalogPickerTokens = [
  "manual" + "SymbolPattern",
  "entryMode: " + '"MANUAL"',
  "submitted" + "Query",
  "start" + "Search",
  "marketDataAcquisition" + "ManualSymbol",
].join("|");

test("request builder fixes dataset, spot market, and source timezone", () => {
  assert.deepEqual(
    buildMarketDataAcquisitionRequest({
      connectorId: "akshare",
      akshareInstrumentKind: "INDEX",
      exchangeId: "binance",
      symbols: ["INDEX-000300"],
      timeframe: "1d",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      adjustment: "qfq",
    }),
    {
      connectorId: "akshare",
      dataset: "index_zh_a_hist",
      symbols: ["INDEX-000300"],
      timeframe: "1d",
      startAt: "2026-01-01T00:00:00+08:00",
      endAt: "2026-01-02T23:59:59+08:00",
      adjustment: "none",
    },
  );
  assert.deepEqual(
    buildMarketDataAcquisitionRequest({
      connectorId: "akshare",
      exchangeId: "binance",
      symbols: ["000001"],
      timeframe: "5m",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      adjustment: "qfq",
    }),
    {
      connectorId: "akshare",
      dataset: "stock_zh_a_hist_min_em",
      symbols: ["000001"],
      timeframe: "5m",
      startAt: "2026-01-01T00:00:00+08:00",
      endAt: "2026-01-02T23:59:59+08:00",
      adjustment: "qfq",
    },
  );
  assert.deepEqual(
    buildMarketDataAcquisitionRequest({
      connectorId: "ccxt",
      exchangeId: "okx",
      symbols: ["BTC/USDT"],
      timeframe: "1h",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      adjustment: "none",
    }),
    {
      connectorId: "ccxt",
      exchangeId: "okx",
      marketType: "spot",
      symbols: ["BTC/USDT"],
      timeframe: "1h",
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-01-02T23:59:59Z",
    },
  );
  assert.deepEqual(
    buildMarketDataAcquisitionMarketRequest({
      marketId: "KR_STOCKS",
      sourcePlanId: "FDR_KRX",
      symbols: ["005930"],
      timeframe: "1d",
      startDate: "2026-01-01",
      endDate: "2026-01-02",
      timeZone: "Asia/Seoul",
      adjustment: null,
    }),
    {
      marketId: "KR_STOCKS",
      sourcePlanId: "FDR_KRX",
      symbols: ["005930"],
      timeframe: "1d",
      startAt: "2026-01-01T00:00:00+09:00",
      endAt: "2026-01-02T23:59:59+09:00",
      adjustment: null,
    },
  );
});

test("date validation reports each field before a download starts", () => {
  assert.deepEqual(
    resolveMarketDataAcquisitionDateIssues("2026-02-30", "2026-03-01"),
    { startDate: "INVALID" },
  );
  assert.deepEqual(
    resolveMarketDataAcquisitionDateIssues("2026-03-02", "2026-03-01"),
    { endDate: "BEFORE_START" },
  );
  assert.deepEqual(
    resolveMarketDataAcquisitionDateIssues("2026-03-01", "2026-03-02"),
    {},
  );
});

test("every acquisition error code resolves to safe localized copy", () => {
  for (const code of MARKET_DATA_ACQUISITION_ERROR_CODES) {
    const key = resolveMarketDataAcquisitionErrorMessageKey(code);
    assert.match(key, /^appText\.marketDataAcquisition/u);
    assert.notEqual(key, code);
  }
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey("HTTP_429"),
    "appText.marketDataAcquisitionErrorRateLimited",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey("AKSHARE_UPSTREAM_FAILED"),
    "appText.marketDataAcquisitionErrorConnection",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey("AKSHARE_UPSTREAM_RETRYABLE"),
    "appText.marketDataAcquisitionErrorConnection",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey("AKSHARE_UPSTREAM_RETRYABLE", {
      statusCode: 429,
    }),
    "appText.marketDataAcquisitionErrorRateLimited",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey(
      "ACQUISITION_FALLBACK_EXHAUSTED",
      { fallbackErrorCode: "FINANCEDATAREADER_SYMBOL_UNAVAILABLE" },
    ),
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey(
      "ACQUISITION_FALLBACK_EXHAUSTED",
      { fallbackErrorCode: "FINANCEDATAREADER_UPSTREAM_FAILED" },
    ),
    "appText.marketDataAcquisitionErrorConnection",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey(
      "FINANCEDATAREADER_UPSTREAM_FAILED",
    ),
    "appText.marketDataAcquisitionErrorConnection",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey("CCXT_UPSTREAM_FAILED"),
    "appText.marketDataAcquisitionErrorConnection",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey(
      "ACQUISITION_IMPORT_VALIDATION_FAILED",
    ),
    "appText.marketDataAcquisitionErrorLocalValidation",
  );
  assert.equal(
    resolveMarketDataAcquisitionErrorMessageKey(
      "ACQUISITION_FALLBACK_EXHAUSTED",
      { fallbackErrorCode: "ACQUISITION_BAR_INVALID" },
    ),
    "appText.marketDataAcquisitionErrorLocalValidation",
  );
});

test("terminal action ACK times out when the main listener never answers", async () => {
  const request = {
    kind: "MARKET_DATA_ACQUISITION",
    action: "REQUEST_IMPORT",
    requestId: "request-without-main-listener",
    stateRevision: 17,
  };
  const ack = await waitForDesktopSecondaryWindowActionAck({
    request,
    subscribe: async () => () => undefined,
    send: async () => undefined,
    timeoutMs: 5,
  });
  assert.equal(ack.status, "REJECTED");
  assert.equal(ack.code, "ACK_TIMEOUT");
});

test("terminal action waits for and matches the successful ACK", async () => {
  const request = {
    kind: "SAMPLE_POOL_IMPORT_CONFIG",
    action: "CONFIRM",
    requestId: "confirm-request-1",
    stateRevision: 23,
  };
  let ackHandler: ((ack: DesktopSecondaryWindowActionAck) => void) | undefined;
  const ack = await waitForDesktopSecondaryWindowActionAck({
    request,
    subscribe: async (handler) => {
      ackHandler = handler;
      return () => undefined;
    },
    send: async () => {
      ackHandler?.({
        ...request,
        status: "ACCEPTED",
        code: "ACTION_ACCEPTED",
      });
    },
    timeoutMs: 50,
  });
  assert.equal(ack.status, "ACCEPTED");
  assert.equal(ack.code, "ACTION_ACCEPTED");
  assert.equal(
    doesDesktopSecondaryWindowActionAckMatchRequest(ack, request),
    true,
  );
});

test("stale revisions and current import blockers are rejected explicitly", () => {
  assert.equal(
    isDesktopSecondaryWindowActionRequestRevisionCurrent(17, 18),
    false,
  );
  assert.equal(
    isDesktopSecondaryWindowActionRequestRevisionCurrent(18, 18),
    true,
  );
  assert.equal(
    resolveCsvImportEntryBlockCode({
      isPreparingCsvImportPreview: true,
      isClearingLocalDataSources: false,
      deletingSamplePoolId: "",
    }),
    "IMPORT_BLOCKED",
  );
});

test("duplicate requests replay ACKs without sealing rejected retries", () => {
  const ledger = createDesktopSecondaryWindowActionAckLedger();
  const accepted: DesktopSecondaryWindowActionAck = {
    kind: "MARKET_DATA_ACQUISITION",
    action: "REQUEST_IMPORT",
    requestId: "request-1",
    stateRevision: 31,
    status: "ACCEPTED",
    code: "ACTION_ACCEPTED",
  };
  ledger.remember(accepted);
  assert.deepEqual(ledger.findByRequest(accepted), accepted);
  assert.deepEqual(
    ledger.replayAcceptedForRequest({
      ...accepted,
      requestId: "request-2",
    }),
    {
      kind: "MARKET_DATA_ACQUISITION",
      action: "REQUEST_IMPORT",
      requestId: "request-2",
      stateRevision: 31,
      status: "ACCEPTED",
      code: "DUPLICATE_ACTION",
    },
  );

  const rejectedLedger = createDesktopSecondaryWindowActionAckLedger();
  rejectedLedger.remember({
    ...accepted,
    status: "REJECTED",
    code: "ACTION_BLOCKED",
  });
  assert.equal(
    rejectedLedger.replayAcceptedForRequest({
      ...accepted,
      requestId: "retry-after-rejection",
    }),
    null,
  );
});

test("import-config readiness remains pending until the matching window is ready", async () => {
  const registry = createCsvImportConfigWindowReadinessRegistry();
  let settled = false;
  const pending = registry.wait("preview-a").then((revision) => {
    settled = true;
    return revision;
  });
  await Promise.resolve();
  assert.equal(settled, false);
  registry.resolve("preview-a", 41);
  assert.equal(await pending, 41);
});

test("superseded import-config readiness rejects without affecting the current token", async () => {
  const registry = createCsvImportConfigWindowReadinessRegistry();
  const superseded = registry.wait("preview-old");
  const current = registry.wait("preview-current");
  registry.rejectExcept(
    "preview-current",
    new Error("configuration superseded"),
  );
  await assert.rejects(superseded, /configuration superseded/u);
  registry.resolve("preview-current", 43);
  assert.equal(await current, 43);
});

test("failed import-config readiness can be cleared and retried", async () => {
  const registry = createCsvImportConfigWindowReadinessRegistry();
  const failed = registry.wait("preview-retry");
  registry.reject("preview-retry", new Error("window failed"));
  await assert.rejects(failed, /window failed/u);
  registry.delete("preview-retry");
  const retry = registry.wait("preview-retry");
  registry.resolve("preview-retry", 47);
  assert.equal(await retry, 47);
});

test("import-config accepts its state revision before visible readiness settles", async () => {
  let acceptedRevision = 0;
  let releaseVisibleReady: (() => void) | undefined;
  const gate = beginCsvImportConfigWindowVisibilityGate(
    49,
    (revision) => {
      acceptedRevision = revision;
    },
    () =>
      new Promise<void>((resolve) => {
        releaseVisibleReady = resolve;
      }),
  );
  let settled = false;
  void gate.then(() => {
    settled = true;
  });

  assert.equal(acceptedRevision, 49);
  assert.equal(settled, false);
  releaseVisibleReady?.();
  assert.equal(await gate, 49);
});

test("import-config visibility gate returns the latest visual-context revision", async () => {
  let acceptedRevision = 0;
  const gate = beginCsvImportConfigWindowVisibilityGate(
    49,
    (revision) => {
      acceptedRevision = revision;
    },
    async () => 52,
  );

  assert.equal(acceptedRevision, 49);
  assert.equal(await gate, 52);
});

test("live config edits use the current store revision before a local gate catches up", () => {
  const store = createDesktopSecondaryWindowStateStore<"IMPORT_CONFIG">();
  const initial = store.publish({
    kind: "IMPORT_CONFIG",
    title: "Import",
    payload: null,
  });
  const lateAcceptedRevision = initial.revision;
  const emitted = store.publish({
    kind: "IMPORT_CONFIG",
    title: "Import",
    payload: { ready: true },
  });

  assert.equal(
    isDesktopSecondaryWindowActionRequestRevisionCurrent(
      emitted.revision,
      lateAcceptedRevision,
    ),
    false,
  );
  assert.equal(
    isDesktopSecondaryWindowActionRequestRevisionCurrent(
      emitted.revision,
      store.get("IMPORT_CONFIG")?.revision,
    ),
    true,
  );
});

test("accepted import handoff ignores later visual-context revision changes", async () => {
  let acquisitionRevision = 51;
  assert.equal(
    isDesktopSecondaryWindowActionRequestRevisionCurrent(
      51,
      acquisitionRevision,
    ),
    true,
  );
  let completePreparation:
    ((value: { ready: true; previewToken: string }) => void) | undefined;
  const completion = new Promise<{ ready: true; previewToken: string }>(
    (resolve) => {
      completePreparation = resolve;
    },
  );
  const readiness = createCsvImportConfigWindowReadinessRegistry();
  let preparedToken = "";
  const handoff = waitForAcceptedMarketDataImportHandoff({
    completion,
    failureReason: "handoff failed",
    isActive: () => true,
    onPreviewPrepared: (preparation) => {
      preparedToken = preparation.previewToken;
    },
    waitForConfigWindow: readiness.wait,
  });

  acquisitionRevision = 52;
  completePreparation?.({ ready: true, previewToken: "preview-visual-change" });
  readiness.resolve("preview-visual-change", 61);

  assert.deepEqual(await handoff, {
    ready: true,
    previewToken: "preview-visual-change",
  });
  assert.equal(preparedToken, "preview-visual-change");
  assert.equal(
    isDesktopSecondaryWindowActionRequestRevisionCurrent(
      51,
      acquisitionRevision,
    ),
    false,
  );
});

test("terminal ACK delivery retries transient emit failures", async () => {
  let attempts = 0;
  const delays: number[] = [];
  await retryDesktopSecondaryWindowActionAckDelivery({
    send: async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("transient emit failure");
      }
    },
    retryDelaysMs: [10, 20, 30],
    wait: async (delayMs) => {
      delays.push(delayMs);
    },
  });

  assert.equal(attempts, 3);
  assert.deepEqual(delays, [10, 20]);
});

test("terminal ACK exhaustion closes the acquisition source and reports rejection", async () => {
  const ledger = createDesktopSecondaryWindowActionAckLedger();
  let closeCalls = 0;
  const reportedReasons: string[] = [];
  const sender = createTerminalActionAckSender({
    closeMarketDataSource: async () => {
      closeCalls += 1;
    },
    fallbackFailureReason: "fallback",
    kind: "MARKET_DATA_ACQUISITION",
    ledger,
    reportRejectedDeliveryFailure: (reason) => {
      reportedReasons.push(reason);
    },
    sendAck: async () => {
      throw new Error("emit exhausted");
    },
  });
  sender.send(
    {
      kind: "MARKET_DATA_ACQUISITION",
      action: "REQUEST_IMPORT",
      requestId: "delivery-exhausted",
      stateRevision: 71,
    },
    "REJECTED",
    "ACTION_REJECTED",
    "import failed",
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(closeCalls, 1);
  assert.deepEqual(reportedReasons, ["import failed"]);
});

test("secondary-window revisions remain monotonic after forget and reopen", () => {
  const store = createDesktopSecondaryWindowStateStore<"ACK_TEST">();
  const first = store.publish({ kind: "ACK_TEST", title: "", payload: null });
  store.forget("ACK_TEST");
  const reopened = store.publish({
    kind: "ACK_TEST",
    title: "",
    payload: null,
  });
  assert.equal(first.revision, 1);
  assert.equal(reopened.revision, 2);
});

test("download remains separate from save and explicit import", () => {
  const createIndex = acquisitionSectionSource.indexOf(
    "const created = await api.createMarketDataAcquisitionMarketJob",
  );
  const refIndex = acquisitionSectionSource.indexOf(
    "jobRef.current = created",
    createIndex,
  );
  const stateIndex = acquisitionSectionSource.indexOf(
    "setJob(created)",
    createIndex,
  );
  assert.ok(
    createIndex >= 0 && refIndex > createIndex && refIndex < stateIndex,
  );

  const saveStart = acquisitionSectionSource.indexOf("const saveReadyJob");
  const saveEnd = acquisitionSectionSource.indexOf(
    "const monitorJob",
    saveStart,
  );
  const saveSource = acquisitionSectionSource.slice(saveStart, saveEnd);
  assert.match(saveSource, /commitMarketDataAcquisitionOutput/u);
  assert.doesNotMatch(saveSource, /openCsvFolderPathAndPrepareImport/u);

  const importStart = acquisitionSectionSource.indexOf("const reviewAndImport");
  const importEnd = acquisitionSectionSource.indexOf(
    "const progressPercent",
    importStart,
  );
  assert.match(
    acquisitionSectionSource.slice(importStart, importEnd),
    /openCsvFolderPathAndPrepareImport/u,
  );
  assert.match(acquisitionStatePageSource, /progress\.stage === "RETRY_WAIT"/u);
  assert.match(acquisitionStatePageSource, /progress\.retryAfterMs/u);
  assert.match(acquisitionStatePageSource, /progress\.retryAttempt/u);
  assert.match(
    importPreviewSource,
    /marketDataAcquisitionMetadata\?\.adjustment/u,
  );
  assert.match(
    importPreviewSource,
    /marketDataAcquisitionRecordedAdjustmentLabel/u,
  );
  assert.match(acquisitionSectionSource, /importRequestPendingRef\.current/u);
  assert.match(acquisitionSectionSource, /importRequestPending/u);
  assert.match(importPreviewSource, /confirmSubmissionRef\.current/u);
  assert.match(
    importPreviewSource,
    /isPreparingCsvImportPreview \|\| isConfirmSubmitting/u,
  );
});

test("acquisition import handoff waits for a visible current config window", () => {
  assert.match(
    importPreviewActionsSource,
    /return \{ accepted: true, completion \}/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /await waitForAcceptedMarketDataImportHandoff\([\s\S]*waitForConfigWindow:[\s\S]*"ACCEPTED"/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /isCurrentDesktopSecondaryWindowAction\(\s*message,\s*api\.getDesktopSecondaryWindowCurrentRevision\(message\.kind\)/u,
  );
  assert.match(runtimeSecondaryWindowsSource, /followLatestRevision: true/u);
  assert.match(
    runtimeSecondaryWindowsSource,
    /pending\.requests\.set\(buildTerminalRequestKey\(request\), request\)/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /pendingRequest\.requestId === pending\.originalRequestId[\s\S]*"DUPLICATE_ACTION"/u,
  );
  assert.match(
    secondaryDataRouteSource,
    /MARKET_DATA_IMPORT_HANDOFF_ACK_TIMEOUT_MS/u,
  );
  assert.match(
    secondaryDataRouteSource,
    /ack\.status === "ACCEPTED"[\s\S]*closeCurrentDesktopSecondaryWindow/u,
  );
  assert.match(
    desktopSecondaryWindowsSource,
    /desktopSecondaryWindowRouteReadyKinds\.has\(kind\)[\s\S]*desktopSecondaryWindowContentReadyRevisionByKind[\s\S]*desktopSecondaryWindowFocusRuntime\.focusByKind\(kind\)/u,
  );
  assert.match(
    desktopSecondaryWindowsSource,
    /DESKTOP_SECONDARY_VISIBLE_READY_DEADLINE_MS[\s\S]*DESKTOP_SECONDARY_WINDOW_VISIBLE_READY_TIMEOUT/u,
  );
  assert.match(
    desktopSecondaryWindowsSource,
    /focusedCurrentRevision === expectedRevision[\s\S]*focusedCurrentRevision > expectedRevision[\s\S]*continue/u,
  );
  assert.match(
    desktopSecondaryWindowsSource,
    /"tauri:\/\/destroyed"[\s\S]*instanceId\s*!==\s*state\.instanceId[\s\S]*desktopSecondaryWindowContentReadyRevisionByKind\.delete\(kind\)[\s\S]*desktopSecondaryWindowStateStore\.forget\(kind, state\.instanceId\)/u,
  );
});

test("download entry is permanent and the four-step market catalog replaces connector-specific pickers", () => {
  const acquisitionEntry = hallSource.indexOf(
    "<MarketDataAcquisitionTriggerSection",
  );
  const importedSection = hallSource.indexOf("importedHallSections");
  assert.ok(acquisitionEntry > importedSection);
  assert.match(acquisitionTriggerSource, /openDesktopSecondaryWindow/u);
  assert.match(acquisitionTriggerSource, /MARKET_DATA_ACQUISITION/u);
  assert.doesNotMatch(acquisitionTriggerSource, /REQUEST_IMPORT/u);
  assert.doesNotMatch(
    acquisitionTriggerSource,
    /openCsvFolderPathAndPrepareImportRef/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /csvImportConfigActionHandlersRef/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /csvImportConfigWindowOperationGenerationRef/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /message\.kind === "MARKET_DATA_ACQUISITION"[\s\S]*handleTerminalRequest\("REQUEST_IMPORT"/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /getDesktopSecondaryWindowCurrentRevision/u,
  );
  assert.match(
    runtimeSecondaryWindowsSource,
    /csvImportConfigAcceptedCloseRequestIdRef/u,
  );
  assert.match(
    secondaryDataRouteSource,
    /sendDesktopSecondaryWindowRouteActionWithAck/u,
  );
  assert.match(
    secondaryDataRouteSource,
    /ack\.status === "ACCEPTED"[\s\S]*closeCurrentDesktopSecondaryWindow/u,
  );
  assert.match(
    desktopSecondaryWindowListenersSource,
    /const actionHandlers = new Set/u,
  );
  assert.match(
    desktopSecondaryWindowsSource,
    /ensureDesktopSecondaryWindowActionListener\(\)[\s\S]*ensureDesktopSecondaryWindowReadyListener\(\)/u,
  );
  assert.match(
    secondaryDataRouteSource,
    /MarketDataAcquisitionSecondaryWindow/u,
  );
  assert.match(
    acquisitionSectionSource,
    /desktop-secondary-window-market-data-acquisition/u,
  );
  assert.doesNotMatch(acquisitionSectionSource, /<AppModal/u);
  assert.match(acquisitionSectionSource, /openMarketDataAcquisitionTermsUrl/u);
  assert.match(nativeCommandsSource, /MARKET_DATA_ACQUISITION_TERMS_HOSTS/u);
  assert.match(nativeCommandsSource, /mod\.openUrl\(parsedUrl\.href\)/u);
  assert.match(
    acquisitionStylesSource,
    /\.market-data-acquisition-catalog-columns \{[\s\S]*grid-template-columns:/u,
  );
  assert.match(
    acquisitionStylesSource,
    /@media \(max-width: 640px\) \{[\s\S]*\.market-data-acquisition-catalog-columns/u,
  );
  assert.match(
    acquisitionWizardSource,
    /wizardStep === 1[\s\S]*marketAcquisitionAssetClassLabelKey[\s\S]*wizardStep === 2[\s\S]*marketAcquisitionMarketLabelKey/u,
  );
  assert.match(
    acquisitionWizardSource,
    /marketDataAcquisitionSourcePlanLabel/u,
  );
  assert.match(
    acquisitionWizardSource,
    /const sourceLabel[\s\S]*sourcePlan\.providerChain/u,
  );
  assert.match(
    acquisitionWizardSource,
    /wizardStep === 3[\s\S]*<MarketAcquisitionInstrumentPicker/u,
  );
  assert.match(
    acquisitionWizardSource,
    /marketDataAcquisitionStepParameters[\s\S]*<DatePicker/u,
  );
  assert.match(
    acquisitionWizardSource,
    /market-data-acquisition-folder-row"[\s\S]*role="group"[\s\S]*aria-invalid=\{Boolean\(fieldErrors\.folder\)/u,
  );
  assert.match(
    acquisitionWizardSource,
    /folderGrant\?\.displayPath \? \(\s*<strong>\{folderGrant\.displayPath\}<\/strong>\s*\) : null/u,
  );
  assert.doesNotMatch(
    acquisitionWizardSource,
    /marketDataAcquisition(?:NoFolderSelected|FolderFirstUseHint|FolderRememberedHint)/u,
  );
  assert.match(
    acquisitionSectionSource,
    /readMarketDataAcquisitionFolderPreference/u,
  );
  assert.match(
    acquisitionActionBarsSource,
    /phase === "READY_TO_SAVE"[\s\S]*onChooseFolder[\s\S]*onRetrySave/u,
  );
  assert.doesNotMatch(
    acquisitionSectionSource,
    /phase === "READY_TO_SAVE" \|\| phase === "FAILED"/u,
  );
  assert.match(
    acquisitionSectionSource,
    /writeMarketDataAcquisitionFolderPreference/u,
  );
  assert.match(
    nativeCommandsSource,
    /downloadDir\(\)[\s\S]*defaultPath,[\s\S]*directory: true/u,
  );
  assert.match(acquisitionStylesSource, /market-data-acquisition-source-plan/u);
  assert.doesNotMatch(acquisitionWizardSource, /sourceAvailabilityNoticeKey/u);
  assert.match(
    acquisitionWizardSource,
    /marketDataAcquisitionThirdPartyUseNotice[\s\S]*marketDataAcquisitionReviewOriginalTermsNotice[\s\S]*<Checkbox[\s\S]*thirdPartyUseConfirmed[\s\S]*marketDataAcquisitionThirdPartyUseAcknowledgement/u,
  );
  assert.match(
    acquisitionSectionSource,
    /setThirdPartyUseConfirmed\(false\)[\s\S]*marketDataAcquisitionThirdPartyUseConfirmationRequired/u,
  );
  assert.match(
    acquisitionActionBarsSource,
    /!selectedPlanAvailable \|\|[\s\S]*!thirdPartyUseConfirmed/u,
  );
  const dataSettingsMessages = JSON.parse(dataSettingsMessagesSource) as Record<
    string,
    { locales: Record<string, string> }
  >;
  const responsibilityCopyKeys = [
    "appText.marketDataAcquisitionSourceBoundaryNotice",
    "appText.marketDataAcquisitionThirdPartyUseLabel",
    "appText.marketDataAcquisitionThirdPartyUseNotice",
    "appText.marketDataAcquisitionReviewOriginalTermsNotice",
    "appText.marketDataAcquisitionThirdPartyUseAcknowledgement",
    "appText.marketDataAcquisitionThirdPartyUseConfirmationRequired",
    "appText.marketDataAcquisitionErrorConnection",
    "appText.marketDataAcquisitionErrorRateLimited",
    "appText.marketDataAcquisitionErrorFormatChanged",
    "appText.marketDataAcquisitionErrorMarketUnavailable",
  ];
  const responsibilityCopy = responsibilityCopyKeys
    .flatMap((key) => Object.values(dataSettingsMessages[key].locales))
    .join("\n");
  assert.match(
    dataSettingsMessages["appText.marketDataAcquisitionThirdPartyUseNotice"]
      .locales["zh-CN"],
    /境内或境外[\s\S]*Zinuto 不参与第三方授权[\s\S]*用户自行承担/u,
  );
  assert.match(
    dataSettingsMessages[
      "appText.marketDataAcquisitionThirdPartyUseAcknowledgement"
    ].locales["zh-CN"],
    /原始项目[\s\S]*数据访问和使用授权[\s\S]*地区可用性[\s\S]*技术可行性[\s\S]*用途合规性/u,
  );
  assert.doesNotMatch(
    responsibilityCopy,
    /Yahoo|Naver|Binance|OKX|Eastmoney|Tencent|Sina|东方财富|腾讯|新浪/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /listMarketDataAcquisitionMarketInstruments/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /const SEARCH_DEBOUNCE_MS = 200/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /const DIRECTORY_LOAD_TIMEOUT_MS = 60_000/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /timeoutMs: DIRECTORY_LOAD_TIMEOUT_MS/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /setDirectoryLoadSecondsRemaining\([\s\S]*Math\.ceil\(\(deadlineAt - Date\.now\(\)\) \/ 1_000\)/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /hasApiErrorCode\(error, DIRECTORY_LOAD_TIMEOUT_ERROR_CODE\)/u,
  );
  assert.match(marketAcquisitionPickerSource, /hasLoadedCatalogRef/u);
  assert.match(
    marketAcquisitionPickerSource,
    /requestedQuery \? SEARCH_DEBOUNCE_MS : 0/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /activeRequestController\.current\?\.abort\(\);[\s\S]*const controller = new AbortController\(\);/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /return \(\) => \{[\s\S]*requestVersion\.current \+= 1;[\s\S]*controller\.abort\(\);/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /const loadMore = \(\) => \{[\s\S]*mode: "MORE",[\s\S]*controller,/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /cursor: "",[\s\S]*requestedQuery,[\s\S]*forceRefresh: loadTrigger\.forceRefresh/u,
  );
  assert.match(marketAcquisitionPickerSource, /refresh: forceRefresh/u);
  assert.match(
    marketAcquisitionPickerSource,
    /marketDataAcquisitionCatalogRefresh/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /market-data-acquisition-catalog-load-more/u,
  );
  assert.match(
    acquisitionStylesSource,
    /market-data-acquisition-catalog-cache-status\[data-visible="false"\]/u,
  );
  assert.match(
    acquisitionStylesSource,
    /market-data-acquisition-catalog-list,[\s\S]*height: 300px;/u,
  );
  assert.match(
    acquisitionSectionSource,
    /usesInstrumentSelectionLayout[\s\S]*market-data-acquisition-body--instrument-selection/u,
  );
  assert.match(
    marketAcquisitionPickerSource,
    /market-data-acquisition-catalog-list[\s\S]*market-data-acquisition-catalog-results[\s\S]*market-data-acquisition-catalog-load-more/u,
  );
  assert.match(
    acquisitionStylesSource,
    /market-data-acquisition-body--instrument-selection[\s\S]*?\.market-data-acquisition-catalog-list,[\s\S]*?height: auto;/u,
  );
  assert.match(
    acquisitionStylesSource,
    /market-data-acquisition-catalog-option > span,[\s\S]*display: flex;/u,
  );
  assert.doesNotMatch(
    acquisitionStylesSource,
    /\.market-data-acquisition-catalog-load-more\s*\{\s*position:\s*sticky;/u,
  );
  assert.doesNotMatch(
    marketAcquisitionPickerSource,
    new RegExp(prohibitedCatalogPickerTokens, "u"),
  );
  assert.match(marketAcquisitionPickerSource, /<Checkbox/u);
  assert.match(marketAcquisitionPickerSource, /role="group"/u);
  assert.match(marketAcquisitionPresentationSource, /STOCKS_AND_INDICES/u);
  assert.match(
    marketAcquisitionPresentationSource,
    /CN_A_SHARE[\s\S]*US_STOCKS/u,
  );
  assert.doesNotMatch(
    marketAcquisitionPresentationSource,
    /CN_SSE|CN_SZSE|US_NASDAQ|US_NYSE|US_AMEX/u,
  );
  assert.match(marketAcquisitionPresentationSource, /GLOBAL_INDICES/u);
  assert.match(marketAcquisitionPresentationSource, /CRYPTO_SPOT/u);
  assert.match(acquisitionWizardSource, /market\.sourcePlans\.length > 1/u);
  assert.doesNotMatch(
    acquisitionWizardSource,
    /marketDataAcquisitionMarketTimeZoneValue0|marketDataAcquisitionFallbackPolicyValue0/u,
  );
  assert.doesNotMatch(
    acquisitionWizardSource,
    /<CcxtMarketPicker|<AkshareInstrumentPicker/u,
  );
  assert.doesNotMatch(acquisitionSectionSource, /<Textarea/u);
  assert.doesNotMatch(
    acquisitionSectionSource,
    /marketDataAcquisitionOpenUpstreamTerms|marketDataAcquisitionTermsConfirmation/u,
  );
  assert.match(acquisitionSectionSource, /<MarketDataAcquisitionWizard/u);
  assert.match(
    acquisitionSectionSource,
    /market-data-acquisition-header-content[\s\S]*<h1>\{tt\("appText\.marketDataAcquisitionDialogTitle"\)\}<\/h1>[\s\S]*<MarketDataAcquisitionStepper/u,
  );
  assert.doesNotMatch(
    acquisitionSectionSource,
    /marketDataAcquisitionDialogDescription/u,
  );
  assert.doesNotMatch(
    acquisitionSectionSource,
    /marketDataAcquisitionStepValue0Value1/u,
  );
  assert.match(
    acquisitionWizardSource,
    /export const MarketDataAcquisitionStepper[\s\S]*className="market-data-acquisition-stepper"/u,
  );
  assert.match(
    acquisitionStylesSource,
    /\.market-data-acquisition-header-content \{[\s\S]*display: grid;[\s\S]*\.market-data-acquisition-title-row \{[\s\S]*justify-content: space-between;/u,
  );
  assert.match(
    acquisitionStylesSource,
    /\.market-data-acquisition-stepper \{[\s\S]*width: 60%;[\s\S]*margin-inline: auto;/u,
  );
  assert.doesNotMatch(
    acquisitionSectionSource,
    /market-data-acquisition-history-toolbar/u,
  );
  assert.match(
    acquisitionSectionSource,
    /name=\{showHistory \? "chevronLeft" : "clock"\}/u,
  );
  assert.doesNotMatch(
    acquisitionSectionSource,
    /createMarketDataAcquisitionJob|listCcxtAcquisitionMarkets|listAkshareAcquisitionInstruments/u,
  );
  assert.match(acquisitionWizardSource, /allowManualInput/u);
  assert.match(acquisitionWizardSource, /aria-invalid/u);
  assert.match(acquisitionWizardSource, /<RadioGroup/u);
  assert.match(
    acquisitionSectionSource,
    /phase === "FORM" \? \([\s\S]*<MarketDataAcquisitionWizard/u,
  );
  assert.match(
    acquisitionStatePageSource,
    /market-data-acquisition-state-page/u,
  );
  assert.doesNotMatch(
    acquisitionSectionSource,
    /termsChecked|persistedTermsAccepted/u,
  );
});

test("the saved view stays concise and the secondary frame has no nested border", () => {
  assert.doesNotMatch(acquisitionResultSource, /acquisition-result-steps/u);
  assert.match(acquisitionResultSource, /marketDataAcquisitionSavedSummary/u);
  assert.match(acquisitionResultSource, /marketDataAcquisitionSavedPathLabel/u);
  assert.match(
    acquisitionActionBarsSource,
    /marketDataAcquisitionImportLater/u,
  );
  assert.match(
    acquisitionActionBarsSource,
    /marketDataAcquisitionReviewAndImport/u,
  );
  assert.match(
    acquisitionStylesSource,
    /padding: var\(--secondary-window-titlebar-safe-top\) 0 0;/u,
  );
  assert.match(
    acquisitionStylesSource,
    /> \.market-data-acquisition-dialog \{[\s\S]*?border: 0;[\s\S]*?border-radius: 0;/u,
  );
});

test("data secondary windows translate from their own visual language", () => {
  assert.match(secondaryDataRouteSource, /ttByLanguage/u);
  assert.match(secondaryDataRouteSource, /ttfByLanguage/u);
  assert.match(
    secondaryDataRouteSource,
    /MarketDataAcquisitionSecondaryWindow[\s\S]*ttByLanguage\(language/u,
  );
  assert.doesNotMatch(
    secondaryDataRouteSource,
    /import \{ tt, ttf \} from "@\/frontend-kernel\/i18n\/messageRuntime"/u,
  );
});
