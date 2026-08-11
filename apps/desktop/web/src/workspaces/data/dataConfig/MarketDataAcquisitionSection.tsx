// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type MarketDataAcquisitionConnector,
  type MarketDataAcquisitionConnectorId,
  type MarketDataAcquisitionJob,
  type MarketDataAcquisitionTimeframe,
} from "@/api";
import { VendorIcon } from "@/assets/graphics";
import { StandardModalFrame } from "@/ui/components";
import { Button } from "@/ui/primitives/button";
import { Spinner } from "@/ui/primitives/loading";
import {
  readMarketDataAcquisitionFolderPreference,
  writeMarketDataAcquisitionFolderPreference,
  type MarketDataAcquisitionFolderPreference,
} from "@/workspaces/data/dataConfig/marketDataAcquisitionCache";
import {
  buildMarketDataAcquisitionRequest,
  MARKET_DATA_ACQUISITION_MAX_SYMBOLS,
  readMarketDataAcquisitionErrorCode,
  resolveMarketDataAcquisitionDateIssues,
  resolveMarketDataAcquisitionErrorMessageKey,
  resolveMarketDataAcquisitionSymbolInputIssue,
} from "@/workspaces/data/dataConfig/marketDataAcquisitionModel";
import { MarketDataAcquisitionResult } from "@/workspaces/data/dataConfig/MarketDataAcquisitionResult";
import {
  MarketDataAcquisitionWizard,
  type AcquisitionWizardStep,
} from "@/workspaces/data/dataConfig/MarketDataAcquisitionWizard";
import {
  MARKET_DATA_ACQUISITION_POLL_RETRY_MAX,
  createDefaultMarketDataAcquisitionDateRange,
  waitForMarketDataAcquisitionPoll,
  waitForMarketDataAcquisitionPollRetry,
} from "@/workspaces/data/dataConfig/marketDataAcquisitionPolling";
import "@/workspaces/data/dataConfig/market-data-acquisition.css";

type Translate = (key: string) => string;
type TranslateFormatted = (key: string, values?: Array<unknown>) => string;
type AcquisitionDialogPhase =
  | "FORM"
  | "RUNNING"
  | "READY_TO_SAVE"
  | "SAVING"
  | "SAVED"
  | "FAILED"
  | "CANCELED";

type AcquisitionField =
  | "source"
  | "symbols"
  | "timeframe"
  | "startDate"
  | "endDate"
  | "folder"
  | "projects";
type AcquisitionFieldErrors = Partial<Record<AcquisitionField, string>>;

type AcquisitionFolderGrant = MarketDataAcquisitionFolderPreference;

type SavedAcquisitionOutput = {
  finalPath: string;
  sourceFolderBookmarkId: string;
  copiedFiles: number;
  copiedBytes: number;
};

type MarketDataAcquisitionSectionProps = {
  formatStorageBytes: (value: number) => string;
  isImportEntryBlocked: boolean;
  locale: string;
  openCsvFolderPathAndPrepareImport: (
    folderPath: string,
    options?: { sourceFolderBookmarkId?: string },
  ) => void | Promise<void>;
  onCloseWindow: () => void;
  tt: Translate;
  ttf: TranslateFormatted;
};

const resolveStageKey = (job: MarketDataAcquisitionJob | null): string => {
  switch (job?.progress.stage) {
    case "CONNECTING":
      return "appText.marketDataAcquisitionStageConnecting";
    case "DOWNLOADING":
      return "appText.marketDataAcquisitionStageDownloading";
    case "NORMALIZING":
      return "appText.marketDataAcquisitionStageNormalizing";
    case "VALIDATING":
      return "appText.marketDataAcquisitionStageValidating";
    case "READY_TO_SAVE":
      return "appText.marketDataAcquisitionStageReadyToSave";
    case "QUEUED":
    default:
      return "appText.marketDataAcquisitionStageQueued";
  }
};

const resolveRuntimeErrorField = (
  rawCode: unknown,
): AcquisitionField | null => {
  const code = String(rawCode || "").toUpperCase();
  if (/SYMBOL|NO_DATA/u.test(code)) return "symbols";
  if (/TIMEFRAME|DATASET/u.test(code)) return "timeframe";
  if (/RANGE|PAGE_LIMIT|ROW_LIMIT|OUTPUT_LIMIT/u.test(code)) return "endDate";
  if (
    /CONNECTOR|RUNTIME|SIDECAR|UPSTREAM|NETWORK|TIMEOUT|CONNECTION|RATE_LIMIT|(?:^|_)429(?:_|$)|EXCHANGE/u.test(
      code,
    )
  ) {
    return "source";
  }
  return null;
};

export const MarketDataAcquisitionSection = ({
  formatStorageBytes,
  isImportEntryBlocked,
  locale,
  openCsvFolderPathAndPrepareImport,
  onCloseWindow,
  tt,
  ttf,
}: MarketDataAcquisitionSectionProps) => {
  const defaultRange = useMemo(createDefaultMarketDataAcquisitionDateRange, []);
  const [phase, setPhase] = useState<AcquisitionDialogPhase>("FORM");
  const [wizardStep, setWizardStep] = useState<AcquisitionWizardStep>(1);
  const [providerId, setProviderId] =
    useState<MarketDataAcquisitionConnectorId>("akshare");
  const [connectors, setConnectors] = useState<
    MarketDataAcquisitionConnector[]
  >([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  const [akshareSymbols, setAkshareSymbols] = useState<string[]>([]);
  const [akshareInstrumentKind, setAkshareInstrumentKind] = useState<
    "A_SHARE" | "INDEX"
  >("A_SHARE");
  const [ccxtSymbols, setCcxtSymbols] = useState<string[]>([]);
  const [exchangeId, setExchangeId] = useState<"binance" | "okx">("binance");
  const [timeframe, setTimeframe] =
    useState<MarketDataAcquisitionTimeframe>("1d");
  const [adjustment, setAdjustment] = useState<"none" | "qfq" | "hfq">("qfq");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [folderGrant, setFolderGrant] = useState<AcquisitionFolderGrant | null>(
    readMarketDataAcquisitionFolderPreference,
  );
  const [job, setJob] = useState<MarketDataAcquisitionJob | null>(null);
  const [savedOutput, setSavedOutput] = useState<SavedAcquisitionOutput | null>(
    null,
  );
  const [runtimeErrorText, setRuntimeErrorText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AcquisitionFieldErrors>({});
  const [importRequestPending, setImportRequestPending] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const importRequestPendingRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const jobRef = useRef<MarketDataAcquisitionJob | null>(null);

  const selectedConnector = useMemo(
    () => connectors.find((connector) => connector.id === providerId) ?? null,
    [connectors, providerId],
  );

  useEffect(
    () => () => {
      pollAbortRef.current?.abort();
      const activeJobId = jobRef.current?.id;
      if (!activeJobId) {
        return;
      }
      void api
        .cancelMarketDataAcquisitionJob(activeJobId)
        .then(() => api.discardMarketDataAcquisitionJob(activeJobId))
        .catch(() => undefined);
    },
    [],
  );

  const loadConnectors = useCallback(async () => {
    setConnectorsLoading(true);
    setRuntimeErrorText("");
    setFieldErrors((current) => ({ ...current, source: undefined }));
    try {
      const result = await api.listMarketDataAcquisitionConnectors();
      setConnectors(Array.isArray(result.connectors) ? result.connectors : []);
    } catch (error) {
      setConnectors([]);
      setFieldErrors((current) => ({
        ...current,
        source: tt("appText.marketDataAcquisitionConnectorLoadFailed"),
      }));
    } finally {
      setConnectorsLoading(false);
    }
  }, [tt]);

  useEffect(() => {
    void loadConnectors();
  }, [loadConnectors]);

  const resetTransientState = useCallback(() => {
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    jobRef.current = null;
    setPhase("FORM");
    setJob(null);
    setSavedOutput(null);
    setRuntimeErrorText("");
    setFieldErrors({});
    importRequestPendingRef.current = false;
    setImportRequestPending(false);
  }, []);

  const moveToStep = useCallback((step: AcquisitionWizardStep) => {
    setWizardStep(step);
    window.requestAnimationFrame(() => stepHeadingRef.current?.focus());
  }, []);

  const returnToForm = useCallback(
    (step: AcquisitionWizardStep) => {
      resetTransientState();
      moveToStep(step);
    },
    [moveToStep, resetTransientState],
  );

  const clearFieldError = useCallback((field: AcquisitionField) => {
    setFieldErrors((current) =>
      current[field] ? { ...current, [field]: undefined } : current,
    );
  }, []);

  const chooseMarketTask = useCallback(
    (nextProvider: MarketDataAcquisitionConnectorId) => {
      if (nextProvider === providerId) return;
      setProviderId(nextProvider);
      setTimeframe(nextProvider === "akshare" ? "1d" : "1h");
      setAkshareInstrumentKind("A_SHARE");
      setAkshareSymbols([]);
      setCcxtSymbols([]);
      setRuntimeErrorText("");
      setFieldErrors({});
    },
    [providerId],
  );

  const chooseTargetFolder = useCallback(async () => {
    setRuntimeErrorText("");
    clearFieldError("folder");
    try {
      const folderPath = await api.pickMarketDataAcquisitionFolderPath(
        folderGrant?.displayPath,
      );
      if (!folderPath) {
        return;
      }
      const grant = await api.authorizeMarketDataAcquisitionFolder({
        folderPath,
        existingGrantId: folderGrant?.grantId || undefined,
      });
      const preference = {
        grantId: String(grant.grantId || "").trim(),
        displayPath: String(grant.displayPath || folderPath).trim(),
      };
      setFolderGrant(preference);
      writeMarketDataAcquisitionFolderPreference(preference);
    } catch (error) {
      setFieldErrors((current) => ({
        ...current,
        folder: tt("appText.marketDataAcquisitionFolderRequired"),
      }));
    }
  }, [clearFieldError, folderGrant?.grantId, tt]);

  const saveReadyJob = useCallback(
    async (readyJob: MarketDataAcquisitionJob) => {
      if (!readyJob.staging || !folderGrant?.grantId) {
        setPhase("READY_TO_SAVE");
        setFieldErrors((current) => ({
          ...current,
          folder: tt("appText.marketDataAcquisitionFolderRequired"),
        }));
        return;
      }
      setPhase("SAVING");
      setRuntimeErrorText("");
      clearFieldError("folder");
      try {
        const output = await api.commitMarketDataAcquisitionOutput({
          grantId: folderGrant.grantId,
          jobId: readyJob.id,
          manifestSha256: readyJob.staging.manifestSha256,
        });
        setSavedOutput({
          finalPath: String(output.finalPath || "").trim(),
          sourceFolderBookmarkId: String(
            output.sourceFolderBookmarkId || "",
          ).trim(),
          copiedFiles: Math.max(0, Number(output.copiedFiles) || 0),
          copiedBytes: Math.max(0, Number(output.copiedBytes) || 0),
        });
        setPhase("SAVED");
        void api
          .discardMarketDataAcquisitionJob(readyJob.id)
          .catch(() => undefined);
      } catch (error) {
        setPhase("READY_TO_SAVE");
        setFieldErrors((current) => ({
          ...current,
          folder: tt("appText.marketDataAcquisitionSaveFailed"),
        }));
      }
    },
    [clearFieldError, folderGrant?.grantId, tt],
  );

  const monitorJob = useCallback(
    async (initialJob: MarketDataAcquisitionJob, signal: AbortSignal) => {
      let current = initialJob;
      let consecutivePollFailures = 0;
      while (current.status === "QUEUED" || current.status === "RUNNING") {
        await waitForMarketDataAcquisitionPoll(signal);
        try {
          current = await api.getMarketDataAcquisitionJob(current.id, {
            signal,
          });
          consecutivePollFailures = 0;
        } catch (error) {
          if (signal.aborted) {
            throw error;
          }
          consecutivePollFailures += 1;
          if (
            consecutivePollFailures > MARKET_DATA_ACQUISITION_POLL_RETRY_MAX
          ) {
            throw error;
          }
          await waitForMarketDataAcquisitionPollRetry(
            consecutivePollFailures,
            signal,
          );
          continue;
        }
        jobRef.current = current;
        setJob(current);
      }
      if (current.status === "READY_TO_SAVE") {
        await saveReadyJob(current);
        return;
      }
      if (current.status === "CANCELED") {
        setPhase("CANCELED");
        void api
          .discardMarketDataAcquisitionJob(current.id)
          .catch(() => undefined);
        return;
      }
      setPhase("FAILED");
      const message = tt(
        resolveMarketDataAcquisitionErrorMessageKey(
          current.error?.code,
          current.error?.args,
        ),
      );
      const errorField = resolveRuntimeErrorField(current.error?.code);
      if (errorField) {
        setFieldErrors((errors) => ({ ...errors, [errorField]: message }));
      } else {
        setRuntimeErrorText(message);
      }
      void api
        .discardMarketDataAcquisitionJob(current.id)
        .catch(() => undefined);
    },
    [saveReadyJob, tt, ttf],
  );

  const startDownload = useCallback(async () => {
    const symbols = providerId === "ccxt" ? ccxtSymbols : akshareSymbols;
    const nextFieldErrors: AcquisitionFieldErrors = {};
    const symbolValidation = resolveMarketDataAcquisitionSymbolInputIssue(
      providerId,
      symbols,
      akshareInstrumentKind,
    );
    if (symbolValidation) {
      const validationKey = {
        EMPTY: "appText.marketDataAcquisitionSymbolsRequired",
        TOO_MANY: "appText.marketDataAcquisitionTooManySymbols",
        INVALID_A_SHARE: "appText.marketDataAcquisitionInvalidAShareSymbols",
        INVALID_CRYPTO_PAIR:
          "appText.marketDataAcquisitionInvalidCryptoSymbols",
      }[symbolValidation];
      nextFieldErrors.symbols =
        symbolValidation === "TOO_MANY"
          ? ttf(validationKey, [MARKET_DATA_ACQUISITION_MAX_SYMBOLS])
          : tt(validationKey);
    }
    const dateIssues = resolveMarketDataAcquisitionDateIssues(
      startDate,
      endDate,
    );
    if (dateIssues.startDate) {
      nextFieldErrors.startDate = tt(
        "appText.marketDataAcquisitionStartDateInvalid",
      );
    }
    if (dateIssues.endDate) {
      nextFieldErrors.endDate = tt(
        dateIssues.endDate === "BEFORE_START"
          ? "appText.marketDataAcquisitionEndDateBeforeStart"
          : "appText.marketDataAcquisitionEndDateInvalid",
      );
    }
    if (!folderGrant?.grantId) {
      nextFieldErrors.folder = tt(
        "appText.marketDataAcquisitionFolderRequired",
      );
    }
    if (!selectedConnector?.available) {
      nextFieldErrors.source = tt(
        "appText.marketDataAcquisitionConnectorUnavailable",
      );
    }
    if (Object.values(nextFieldErrors).some(Boolean)) {
      setFieldErrors(nextFieldErrors);
      if (nextFieldErrors.source) {
        moveToStep(1);
      } else if (nextFieldErrors.symbols) {
        moveToStep(2);
      } else {
        moveToStep(3);
      }
      return;
    }

    setFieldErrors({});
    setRuntimeErrorText("");
    setSavedOutput(null);
    setPhase("RUNNING");
    const controller = new AbortController();
    pollAbortRef.current?.abort();
    pollAbortRef.current = controller;
    try {
      const created = await api.createMarketDataAcquisitionJob(
        buildMarketDataAcquisitionRequest({
          connectorId: providerId,
          akshareInstrumentKind,
          exchangeId,
          symbols,
          timeframe,
          startDate,
          endDate,
          adjustment,
        }),
        { signal: controller.signal },
      );
      jobRef.current = created;
      setJob(created);
      await monitorJob(created, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setPhase("FAILED");
      const errorCode = readMarketDataAcquisitionErrorCode(error);
      const message = tt(
        resolveMarketDataAcquisitionErrorMessageKey(errorCode),
      );
      const errorField = resolveRuntimeErrorField(errorCode);
      if (errorField) {
        setFieldErrors((errors) => ({ ...errors, [errorField]: message }));
      } else {
        setRuntimeErrorText(message);
      }
      // Transient polling failures must not cancel+discard a QUEUED/RUNNING
      // job. Only the terminal job status paths inside monitorJob discard the
      // job; here the job is left intact so a retry can resume it.
    } finally {
      if (pollAbortRef.current === controller) {
        pollAbortRef.current = null;
      }
    }
  }, [
    adjustment,
    akshareInstrumentKind,
    akshareSymbols,
    ccxtSymbols,
    endDate,
    exchangeId,
    folderGrant?.grantId,
    monitorJob,
    moveToStep,
    providerId,
    selectedConnector,
    startDate,
    timeframe,
    tt,
    ttf,
  ]);

  const cancelDownload = useCallback(async () => {
    const activeJob = jobRef.current;
    pollAbortRef.current?.abort();
    pollAbortRef.current = null;
    if (activeJob?.id) {
      try {
        const canceled = await api.cancelMarketDataAcquisitionJob(activeJob.id);
        setJob(canceled);
        await api
          .discardMarketDataAcquisitionJob(activeJob.id)
          .catch(() => undefined);
      } catch {
        // Cancellation is best effort; the runtime also cancels jobs on exit.
      }
    }
    jobRef.current = null;
    setPhase("CANCELED");
  }, []);

  const requestClose = () => {
    if (phase === "SAVING") {
      return;
    }
    if (phase === "RUNNING") {
      void cancelDownload();
    }
    onCloseWindow();
  };

  const openProjectUrl = (url: string) => {
    clearFieldError("projects");
    void api.openMarketDataAcquisitionTermsUrl(url).catch(() => {
      setFieldErrors((current) => ({
        ...current,
        projects: tt("appText.marketDataAcquisitionOpenTermsFailed"),
      }));
    });
  };

  const retrySave = () => {
    if (job?.status === "READY_TO_SAVE") {
      void saveReadyJob(job);
    }
  };

  const reviewAndImport = () => {
    if (
      !savedOutput?.finalPath ||
      isImportEntryBlocked ||
      importRequestPendingRef.current
    ) {
      return;
    }
    importRequestPendingRef.current = true;
    setImportRequestPending(true);
    setRuntimeErrorText("");
    try {
      const importRequest = openCsvFolderPathAndPrepareImport(
        savedOutput.finalPath,
        {
          sourceFolderBookmarkId:
            savedOutput.sourceFolderBookmarkId || undefined,
        },
      );
      void Promise.resolve(importRequest).then(
        () => {
          importRequestPendingRef.current = false;
          setImportRequestPending(false);
        },
        (error) => {
          importRequestPendingRef.current = false;
          setImportRequestPending(false);
          console.error(
            "[market-data-acquisition] import handoff failed",
            error,
          );
          setRuntimeErrorText(
            tt("appText.marketDataAcquisitionImportStartFailed"),
          );
        },
      );
    } catch (error) {
      importRequestPendingRef.current = false;
      setImportRequestPending(false);
      console.error("[market-data-acquisition] import handoff failed", error);
      setRuntimeErrorText(tt("appText.marketDataAcquisitionImportStartFailed"));
    }
  };

  const progressPercent = job
    ? Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (job.progress.completedSymbols /
              Math.max(1, job.progress.totalSymbols)) *
              100,
          ),
        ),
      )
    : 0;
  const canStartOnline = Boolean(
    selectedConnector?.available && !connectorsLoading,
  );
  const timeframeOptions = (
    providerId === "akshare" && akshareInstrumentKind === "INDEX"
      ? ["1d"]
      : (selectedConnector?.supportedTimeframes ?? ["1m", "5m", "1h", "1d"])
  ).map((value) => ({ value, label: value }));

  const selectedSymbols = providerId === "ccxt" ? ccxtSymbols : akshareSymbols;
  const resultSourceLabel = tt(
    providerId === "ccxt"
      ? "appText.marketDataAcquisitionTaskCryptoTitle"
      : "appText.marketDataAcquisitionTaskAShareTitle",
  );
  const failedReturnStep: AcquisitionWizardStep = fieldErrors.source
    ? 1
    : fieldErrors.symbols
      ? 2
      : 3;
  const statusErrorText =
    runtimeErrorText ||
    Object.values(fieldErrors).find((message): message is string =>
      Boolean(message),
    ) ||
    tt("appText.marketDataAcquisitionJobFailed");

  const formActions =
    wizardStep === 1 ? (
      <>
        <Button type="button" variant="outline" onClick={requestClose}>
          {tt("appText.cancel")}
        </Button>
        <Button
          type="button"
          disabled={!canStartOnline}
          onClick={() => moveToStep(2)}
        >
          {connectorsLoading ? <Spinner decorative size="sm" /> : null}
          {tt("appText.marketDataAcquisitionContinue")}
        </Button>
      </>
    ) : wizardStep === 2 ? (
      <>
        <Button type="button" variant="outline" onClick={() => moveToStep(1)}>
          {tt("appText.marketDataAcquisitionBack")}
        </Button>
        <Button
          type="button"
          disabled={selectedSymbols.length === 0}
          onClick={() => moveToStep(3)}
        >
          {tt("appText.marketDataAcquisitionContinue")}
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="outline" onClick={() => moveToStep(2)}>
          {tt("appText.marketDataAcquisitionBack")}
        </Button>
        <Button
          type="button"
          disabled={!canStartOnline}
          onClick={() => void startDownload()}
        >
          {tt("appText.marketDataAcquisitionStartDownload")}
        </Button>
      </>
    );

  const stateActions =
    phase === "SAVED" && savedOutput ? (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => void api.openLocalPath(savedOutput.finalPath)}
        >
          {tt("appText.marketDataAcquisitionOpenFolder")}
        </Button>
        <Button type="button" variant="outline" onClick={requestClose}>
          {tt("appText.marketDataAcquisitionImportLater")}
        </Button>
        <Button
          type="button"
          loading={importRequestPending}
          disabled={isImportEntryBlocked || importRequestPending}
          onClick={reviewAndImport}
        >
          {tt("appText.marketDataAcquisitionReviewAndImport")}
        </Button>
      </>
    ) : phase === "RUNNING" ? (
      <Button
        type="button"
        variant="outline"
        onClick={() => void cancelDownload()}
      >
        {tt("appText.marketDataAcquisitionCancelDownload")}
      </Button>
    ) : phase === "SAVING" ? (
      <Button type="button" disabled>
        <Spinner decorative size="sm" />
        {tt("appText.marketDataAcquisitionStageSaving")}
      </Button>
    ) : phase === "READY_TO_SAVE" ? (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => void chooseTargetFolder()}
        >
          {tt("appText.marketDataAcquisitionChooseFolder")}
        </Button>
        <Button
          type="button"
          disabled={!folderGrant?.grantId}
          onClick={retrySave}
        >
          {tt("appText.marketDataAcquisitionRetrySave")}
        </Button>
      </>
    ) : phase === "FAILED" ? (
      <>
        <Button type="button" variant="outline" onClick={requestClose}>
          {tt("appText.close2")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => returnToForm(failedReturnStep)}
        >
          {tt("appText.marketDataAcquisitionAdjustSettings")}
        </Button>
        <Button
          type="button"
          disabled={!canStartOnline}
          onClick={() => void startDownload()}
        >
          {tt("appText.marketDataAcquisitionRetryDownload")}
        </Button>
      </>
    ) : phase === "CANCELED" ? (
      <>
        <Button type="button" variant="outline" onClick={requestClose}>
          {tt("appText.close2")}
        </Button>
        <Button type="button" onClick={() => returnToForm(3)}>
          {tt("appText.marketDataAcquisitionAdjustSettings")}
        </Button>
      </>
    ) : null;

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-market-data-acquisition">
      <StandardModalFrame
        title={<h1>{tt("appText.marketDataAcquisitionDialogTitle")}</h1>}
        description={tt("appText.marketDataAcquisitionDialogDescription")}
        variant="workflow"
        className="market-data-acquisition-dialog"
        headerClassName="market-data-acquisition-header"
        bodyClassName="market-data-acquisition-body"
        footerClassName="market-data-acquisition-footer"
        actions={phase === "FORM" ? formActions : stateActions}
      >
        {phase === "SAVED" && runtimeErrorText ? (
          <div className="market-data-acquisition-error" role="alert">
            <VendorIcon name="alertTriangle" aria-hidden="true" />
            <span>{runtimeErrorText}</span>
          </div>
        ) : null}

        {phase === "FORM" ? (
          <MarketDataAcquisitionWizard
            adjustment={adjustment}
            akshareInstrumentKind={akshareInstrumentKind}
            akshareSymbols={akshareSymbols}
            ccxtSymbols={ccxtSymbols}
            connectors={connectors}
            connectorsLoading={connectorsLoading}
            endDate={endDate}
            exchangeId={exchangeId}
            fieldErrors={fieldErrors}
            folderGrant={folderGrant}
            headingRef={stepHeadingRef}
            locale={locale}
            providerId={providerId}
            resultSourceLabel={resultSourceLabel}
            selectedConnector={selectedConnector}
            selectedSymbols={selectedSymbols}
            startDate={startDate}
            timeframe={timeframe}
            timeframeOptions={timeframeOptions}
            tt={tt}
            ttf={ttf}
            wizardStep={wizardStep}
            onAdjustmentChange={setAdjustment}
            onAkshareKindChange={(kind) => {
              setAkshareInstrumentKind(kind);
              setAkshareSymbols([]);
              setTimeframe("1d");
              if (kind === "INDEX") setAdjustment("none");
              clearFieldError("symbols");
              clearFieldError("timeframe");
            }}
            onAkshareSymbolsChange={(values) => {
              setAkshareSymbols(values);
              clearFieldError("symbols");
            }}
            onCcxtSymbolsChange={(values) => {
              setCcxtSymbols(values);
              clearFieldError("symbols");
            }}
            onChooseFolder={() => void chooseTargetFolder()}
            onEndDateChange={(value) => {
              setEndDate(value);
              clearFieldError("endDate");
            }}
            onExchangeChange={(value) => {
              setExchangeId(value);
              setCcxtSymbols([]);
              clearFieldError("symbols");
            }}
            onOpenProject={openProjectUrl}
            onProviderChange={chooseMarketTask}
            onRetryConnectors={() => void loadConnectors()}
            onStartDateChange={(value) => {
              setStartDate(value);
              clearFieldError("startDate");
              clearFieldError("endDate");
            }}
            onTimeframeChange={(value) => {
              setTimeframe(value);
              clearFieldError("timeframe");
            }}
          />
        ) : phase === "SAVED" && savedOutput ? (
          <MarketDataAcquisitionResult
            endDate={endDate}
            fileCount={savedOutput.copiedFiles}
            formattedBytes={formatStorageBytes(savedOutput.copiedBytes)}
            instrumentCount={
              job?.request.symbols.length ?? selectedSymbols.length
            }
            outputPath={savedOutput.finalPath}
            sourceLabel={resultSourceLabel}
            startDate={startDate}
            timeframe={timeframe}
            tt={tt}
            ttf={ttf}
          />
        ) : (
          <section
            className="market-data-acquisition-state-page"
            role={phase === "FAILED" ? "alert" : "status"}
            aria-live="polite"
          >
            <span
              className="market-data-acquisition-state-icon"
              data-tone={
                phase === "FAILED"
                  ? "danger"
                  : phase === "CANCELED"
                    ? "neutral"
                    : "progress"
              }
              aria-hidden="true"
            >
              {phase === "RUNNING" || phase === "SAVING" ? (
                <Spinner decorative />
              ) : (
                <VendorIcon
                  name={phase === "FAILED" ? "alertTriangle" : "circleAlert"}
                />
              )}
            </span>
            <div>
              <h2>
                {tt(
                  phase === "RUNNING"
                    ? "appText.marketDataAcquisitionRunningTitle"
                    : phase === "SAVING"
                      ? "appText.marketDataAcquisitionSavingTitle"
                      : phase === "READY_TO_SAVE"
                        ? "appText.marketDataAcquisitionReadyToSaveTitle"
                        : phase === "FAILED"
                          ? "appText.marketDataAcquisitionFailedTitle"
                          : "appText.marketDataAcquisitionCanceledTitle",
                )}
              </h2>
              <p>
                {phase === "RUNNING"
                  ? job?.progress.stage === "RETRY_WAIT"
                    ? ttf(
                        "appText.marketDataAcquisitionStageRetryWaitValue0Value1",
                        [
                          Math.max(
                            1,
                            Math.ceil(job.progress.retryAfterMs / 1_000),
                          ),
                          job.progress.retryAttempt,
                        ],
                      )
                    : tt(resolveStageKey(job))
                  : phase === "SAVING"
                    ? tt("appText.marketDataAcquisitionSavingDescription")
                    : phase === "READY_TO_SAVE"
                      ? statusErrorText
                      : phase === "FAILED"
                        ? statusErrorText
                        : tt(
                            "appText.marketDataAcquisitionCanceledDescription",
                          )}
              </p>
            </div>
            {phase === "RUNNING" || phase === "SAVING" ? (
              <section
                className="market-data-acquisition-progress"
                aria-label={tt("appText.marketDataAcquisitionProgressLabel")}
              >
                <div>
                  <span>
                    {job
                      ? ttf(
                          "appText.marketDataAcquisitionProgressValue0Value1",
                          [
                            job.progress.completedSymbols,
                            job.progress.totalSymbols,
                          ],
                        )
                      : tt("appText.marketDataAcquisitionPreparing")}
                  </span>
                  <strong>
                    {phase === "SAVING" ? "100%" : `${progressPercent}%`}
                  </strong>
                </div>
                <progress
                  max={100}
                  value={phase === "SAVING" ? 100 : progressPercent}
                />
              </section>
            ) : null}
            {phase === "READY_TO_SAVE" ? (
              <div className="market-data-acquisition-state-boundary">
                <VendorIcon name="folderCheck" aria-hidden="true" />
                <span>
                  {tt("appText.marketDataAcquisitionStateBoundaryNotice")}
                </span>
              </div>
            ) : null}
          </section>
        )}
      </StandardModalFrame>
    </section>
  );
};
