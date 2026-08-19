// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type MarketDataAcquisitionAssetClass,
  type MarketDataAcquisitionCatalog,
  type MarketDataAcquisitionInstrument,
  type MarketDataAcquisitionJobSummary,
  type MarketDataAcquisitionMarket,
  type MarketDataAcquisitionMarketId,
  type MarketDataAcquisitionMarketJob,
  type MarketDataAcquisitionSourcePlanId,
  type MarketDataAcquisitionTimeframe,
} from "@/api";
import { VendorIcon } from "@/assets/graphics";
import { StandardModalFrame } from "@/ui/components";
import { Button } from "@/ui/primitives/button";
import {
  readMarketDataAcquisitionFolderPreference,
  writeMarketDataAcquisitionFolderPreference,
  type MarketDataAcquisitionFolderPreference,
} from "@/workspaces/data/dataConfig/marketDataAcquisitionCache";
import {
  buildMarketDataAcquisitionMarketRequest,
  projectMarketDataAcquisitionRowEstimate,
  MARKET_DATA_ACQUISITION_MAX_ROWS,
  MARKET_DATA_ACQUISITION_MAX_SYMBOLS,
  readMarketDataAcquisitionErrorCode,
  resolveMarketDataAcquisitionDateIssues,
  resolveMarketDataAcquisitionErrorMessageKey,
  resolveMarketDataAcquisitionSaveErrorKey,
  readMarketDataAcquisitionValidationDetail,
} from "@/workspaces/data/dataConfig/marketDataAcquisitionModel";
import { marketAcquisitionMarketLabelKey } from "@/workspaces/data/dataConfig/marketAcquisitionPresentation";
import { MarketDataAcquisitionResult } from "@/workspaces/data/dataConfig/MarketDataAcquisitionResult";
import { MarketDataAcquisitionHistory } from "@/workspaces/data/dataConfig/MarketDataAcquisitionHistory";
import { MarketDataAcquisitionStatePage } from "@/workspaces/data/dataConfig/MarketDataAcquisitionStatePage";
import { MarketDataAcquisitionActionBars } from "@/workspaces/data/dataConfig/MarketDataAcquisitionActionBars";
import {
  MarketDataAcquisitionStepper,
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
export type AcquisitionDialogPhase =
  | "FORM"
  | "RUNNING"
  | "READY_TO_SAVE"
  | "SAVING"
  | "SAVED"
  | "FAILED"
  | "CANCELED";

type AcquisitionField =
  | "assetClass"
  | "source"
  | "market"
  | "symbols"
  | "timeframe"
  | "startDate"
  | "endDate"
  | "folder"
  | "projects"
  | "thirdPartyUse";
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

const resolveRuntimeErrorField = (
  rawCode: unknown,
): AcquisitionField | null => {
  const code = String(rawCode || "").toUpperCase();
  if (/SYMBOL|NO_DATA/u.test(code)) return "symbols";
  if (/TIMEFRAME_UNSUPPORTED|OHLCV|DATASET/u.test(code)) return "timeframe";
  if (/RANGE|PAGE_LIMIT|ROW_LIMIT|OUTPUT_LIMIT/u.test(code)) return "endDate";
  if (/MARKET|SOURCE_PLAN/u.test(code)) return "market";
  if (
    /CONNECTOR|RUNTIME|SIDECAR|UPSTREAM|NETWORK|TIMEOUT|CONNECTION|RATE_LIMIT|(?:^|_)429(?:_|$)|EXCHANGE/u.test(
      code,
    )
  ) {
    return "source";
  }
  return null;
};

const findMarket = (
  catalog: MarketDataAcquisitionCatalog | null,
  marketId: MarketDataAcquisitionMarketId | null,
): MarketDataAcquisitionMarket | null =>
  catalog?.markets.find((entry) => entry.id === marketId) ?? null;

const planLabel = (
  catalog: MarketDataAcquisitionCatalog | null,
  market: MarketDataAcquisitionMarket | null,
  sourcePlanId: MarketDataAcquisitionSourcePlanId | null,
): string => {
  const plan = market?.sourcePlans.find((entry) => entry.id === sourcePlanId);
  if (!plan || !catalog) return "";
  return plan.providerChain
    .map(
      (providerId) =>
        catalog.providers.find((entry) => entry.id === providerId)?.name ??
        providerId,
    )
    .join(" / ");
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
  const [catalog, setCatalog] = useState<MarketDataAcquisitionCatalog | null>(
    null,
  );
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [assetClassId, setAssetClassId] = useState<
    MarketDataAcquisitionAssetClass["id"] | null
  >(null);
  const [marketId, setMarketId] =
    useState<MarketDataAcquisitionMarketId | null>(null);
  const [sourcePlanId, setSourcePlanId] =
    useState<MarketDataAcquisitionSourcePlanId | null>(null);
  const [thirdPartyUseConfirmed, setThirdPartyUseConfirmed] = useState(false);
  const [selectedInstruments, setSelectedInstruments] = useState<
    MarketDataAcquisitionInstrument[]
  >([]);
  const [timeframe, setTimeframe] =
    useState<MarketDataAcquisitionTimeframe>("1d");
  const [adjustment, setAdjustment] = useState<"none" | "qfq" | "hfq" | null>(
    null,
  );
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [folderGrant, setFolderGrant] = useState<AcquisitionFolderGrant | null>(
    readMarketDataAcquisitionFolderPreference,
  );
  const [job, setJob] = useState<MarketDataAcquisitionMarketJob | null>(null);
  const [savedOutput, setSavedOutput] = useState<SavedAcquisitionOutput | null>(
    null,
  );
  const [runtimeErrorText, setRuntimeErrorText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AcquisitionFieldErrors>({});
  const [importRequestPending, setImportRequestPending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyJobs, setHistoryJobs] = useState<
    MarketDataAcquisitionJobSummary[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const importRequestPendingRef = useRef(false);
  const pollAbortRef = useRef<AbortController | null>(null);
  const jobRef = useRef<MarketDataAcquisitionMarketJob | null>(null);

  const selectedMarket = useMemo(
    () => findMarket(catalog, marketId),
    [catalog, marketId],
  );
  const selectedPlan = useMemo(
    () =>
      selectedMarket?.sourcePlans.find((entry) => entry.id === sourcePlanId) ??
      null,
    [selectedMarket, sourcePlanId],
  );

  // Closing the window stops this dialog's polling, but the backend keeps the
  // job running; it stays visible (and resumable) in the download history.
  useEffect(
    () => () => {
      pollAbortRef.current?.abort();
    },
    [],
  );

  const refreshHistory = useCallback(async () => {
    try {
      const result = await api.listMarketDataAcquisitionMarketJobs();
      setHistoryJobs(result.jobs);
    } catch {
      setHistoryJobs((current) => current);
    }
  }, []);

  useEffect(() => {
    if (!showHistory) return;
    setHistoryLoading(true);
    void refreshHistory().finally(() => setHistoryLoading(false));
    const timer = window.setInterval(() => {
      void refreshHistory();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [showHistory, refreshHistory]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setRuntimeErrorText("");
    setFieldErrors((current) => ({
      ...current,
      assetClass: undefined,
      market: undefined,
      source: undefined,
    }));
    try {
      setCatalog(await api.listMarketDataAcquisitionCatalog());
    } catch {
      setCatalog(null);
      setFieldErrors((current) => ({
        ...current,
        assetClass: tt("appText.marketDataAcquisitionCatalogLoadFailed"),
      }));
    } finally {
      setCatalogLoading(false);
    }
  }, [tt]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

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

  const chooseAssetClass = useCallback(
    (nextAssetClassId: MarketDataAcquisitionAssetClass["id"]) => {
      if (nextAssetClassId === assetClassId) return;
      setAssetClassId(nextAssetClassId);
      setMarketId(null);
      setSourcePlanId(null);
      setThirdPartyUseConfirmed(false);
      setSelectedInstruments([]);
      setAdjustment(null);
      setTimeframe("1d");
      setRuntimeErrorText("");
      setFieldErrors({});
    },
    [assetClassId],
  );

  const chooseMarket = useCallback(
    (nextMarketId: MarketDataAcquisitionMarketId) => {
      const nextMarket = findMarket(catalog, nextMarketId);
      if (!nextMarket) return;
      const nextPlan =
        nextMarket.sourcePlans.find((plan) => plan.available) ??
        nextMarket.sourcePlans[0] ??
        null;
      setMarketId(nextMarketId);
      setSourcePlanId(nextPlan?.id ?? null);
      setThirdPartyUseConfirmed(false);
      setSelectedInstruments([]);
      setTimeframe(
        nextMarket.supportedTimeframes.includes("1d")
          ? "1d"
          : (nextMarket.supportedTimeframes[0] ?? "1d"),
      );
      setAdjustment(
        nextMarket.adjustmentOptions.includes("none") ? "none" : null,
      );
      setRuntimeErrorText("");
      setFieldErrors({});
    },
    [catalog],
  );

  const chooseSourcePlan = useCallback(
    (nextSourcePlanId: MarketDataAcquisitionSourcePlanId) => {
      if (nextSourcePlanId === sourcePlanId) return;
      setSourcePlanId(nextSourcePlanId);
      setThirdPartyUseConfirmed(false);
      setSelectedInstruments([]);
      clearFieldError("source");
      clearFieldError("symbols");
      clearFieldError("thirdPartyUse");
    },
    [clearFieldError, sourcePlanId],
  );

  const chooseTargetFolder = useCallback(async () => {
    setRuntimeErrorText("");
    clearFieldError("folder");
    try {
      const folderPath = await api.pickMarketDataAcquisitionFolderPath(
        folderGrant?.displayPath,
      );
      if (!folderPath) return;
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
    } catch {
      setFieldErrors((current) => ({
        ...current,
        folder: tt("appText.marketDataAcquisitionFolderRequired"),
      }));
    }
  }, [clearFieldError, folderGrant?.displayPath, folderGrant?.grantId, tt]);

  const saveReadyJob = useCallback(
    async (readyJob: MarketDataAcquisitionMarketJob) => {
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
          .discardMarketDataAcquisitionMarketJob(readyJob.id)
          .catch(() => undefined);
      } catch (error) {
        setPhase("READY_TO_SAVE");
        setFieldErrors((current) => ({
          ...current,
          folder: tt(
            resolveMarketDataAcquisitionSaveErrorKey(
              readMarketDataAcquisitionErrorCode(error),
            ),
          ),
        }));
      }
    },
    [clearFieldError, folderGrant?.grantId, tt],
  );

  const monitorJob = useCallback(
    async (initialJob: MarketDataAcquisitionMarketJob, signal: AbortSignal) => {
      let current = initialJob;
      let consecutivePollFailures = 0;
      while (current.status === "QUEUED" || current.status === "RUNNING") {
        await waitForMarketDataAcquisitionPoll(signal);
        try {
          current = await api.getMarketDataAcquisitionMarketJob(current.id, {
            signal,
          });
          consecutivePollFailures = 0;
        } catch (error) {
          if (signal.aborted) throw error;
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
    },
    [saveReadyJob, tt],
  );

  const startDownload = useCallback(async () => {
    const nextFieldErrors: AcquisitionFieldErrors = {};
    if (!assetClassId) {
      nextFieldErrors.assetClass = tt(
        "appText.marketDataAcquisitionAssetClassRequired",
      );
    }
    if (!selectedMarket) {
      nextFieldErrors.market = tt(
        "appText.marketDataAcquisitionMarketSelectionRequired",
      );
    }
    if (!selectedPlan?.available) {
      nextFieldErrors.source = tt(
        "appText.marketDataAcquisitionConnectorUnavailable",
      );
    }
    if (!thirdPartyUseConfirmed) {
      nextFieldErrors.thirdPartyUse = tt(
        "appText.marketDataAcquisitionThirdPartyUseConfirmationRequired",
      );
    }
    const symbols = selectedInstruments.map((instrument) => instrument.symbol);
    if (!symbols.length) {
      nextFieldErrors.symbols = tt(
        "appText.marketDataAcquisitionSymbolsRequired",
      );
    } else if (symbols.length > MARKET_DATA_ACQUISITION_MAX_SYMBOLS) {
      nextFieldErrors.symbols = ttf(
        "appText.marketDataAcquisitionTooManySymbols",
        [MARKET_DATA_ACQUISITION_MAX_SYMBOLS],
      );
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
    if (
      selectedMarket &&
      !selectedMarket.supportedTimeframes.includes(timeframe)
    ) {
      nextFieldErrors.timeframe = tt(
        "appText.marketDataAcquisitionErrorMarketUnavailable",
      );
    }
    if (Object.values(nextFieldErrors).some(Boolean)) {
      setFieldErrors(nextFieldErrors);
      moveToStep(
        nextFieldErrors.assetClass
          ? 1
          : nextFieldErrors.market ||
              nextFieldErrors.source ||
              nextFieldErrors.thirdPartyUse
            ? 2
            : nextFieldErrors.symbols
              ? 3
              : 4,
      );
      return;
    }
    if (!selectedMarket || !sourcePlanId || !selectedPlan) return;

    setFieldErrors({});
    setRuntimeErrorText("");
    setSavedOutput(null);
    setPhase("RUNNING");
    const controller = new AbortController();
    pollAbortRef.current?.abort();
    pollAbortRef.current = controller;
    try {
      const created = await api.createMarketDataAcquisitionMarketJob(
        buildMarketDataAcquisitionMarketRequest({
          marketId: selectedMarket.id,
          sourcePlanId,
          symbols,
          timeframe,
          startDate,
          endDate,
          timeZone: selectedMarket.timeZone,
          adjustment,
        }),
        { signal: controller.signal },
      );
      jobRef.current = created;
      setJob(created);
      await monitorJob(created, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      const orphanJob = jobRef.current;
      if (
        orphanJob &&
        (orphanJob.status === "QUEUED" || orphanJob.status === "RUNNING")
      ) {
        void api
          .cancelMarketDataAcquisitionMarketJob(orphanJob.id)
          .catch(() => undefined);
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
    } finally {
      if (pollAbortRef.current === controller) {
        pollAbortRef.current = null;
      }
    }
  }, [
    adjustment,
    assetClassId,
    endDate,
    folderGrant?.grantId,
    monitorJob,
    moveToStep,
    selectedInstruments,
    selectedMarket,
    selectedPlan,
    sourcePlanId,
    startDate,
    thirdPartyUseConfirmed,
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
        const canceled = await api.cancelMarketDataAcquisitionMarketJob(
          activeJob.id,
        );
        setJob(canceled);
      } catch {
        setRuntimeErrorText(tt("appText.marketDataAcquisitionCancelFailed"));
        return;
      }
    }
    jobRef.current = null;
    setPhase("CANCELED");
  }, [tt]);

  const resumeHistoryJob = useCallback(
    async (summary: MarketDataAcquisitionJobSummary) => {
      try {
        const resumed = await api.getMarketDataAcquisitionMarketJob(summary.id);
        jobRef.current = resumed;
        setJob(resumed);
        setShowHistory(false);
        setRuntimeErrorText("");
        if (resumed.status === "RUNNING" || resumed.status === "QUEUED") {
          setPhase("RUNNING");
          const controller = new AbortController();
          pollAbortRef.current?.abort();
          pollAbortRef.current = controller;
          void monitorJob(resumed, controller.signal).catch(() => undefined);
        } else if (resumed.status === "READY_TO_SAVE") {
          setPhase("READY_TO_SAVE");
        } else {
          setPhase(resumed.status === "CANCELED" ? "CANCELED" : "FAILED");
        }
      } catch {
        void refreshHistory();
      }
    },
    [monitorJob, refreshHistory],
  );

  const removeHistoryJob = useCallback(
    async (jobId: string) => {
      try {
        await api.discardMarketDataAcquisitionMarketJob(jobId);
      } catch {
        // A record that is already gone needs no further cleanup.
      }
      await refreshHistory();
    },
    [refreshHistory],
  );

  const requestClose = () => {
    if (phase === "SAVING") return;
    if (phase === "RUNNING") void cancelDownload();
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
    if (job?.status === "READY_TO_SAVE") void saveReadyJob(job);
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
    selectedPlan?.available && thirdPartyUseConfirmed && !catalogLoading,
  );
  const resultSourceLabel = selectedMarket
    ? `${tt(marketAcquisitionMarketLabelKey(selectedMarket.id))} · ${planLabel(
        catalog,
        selectedMarket,
        sourcePlanId,
      )}`
    : "";
  const actualSourceLabel =
    job?.sourceResults
      .map((result) => {
        const provider = result.finalSource?.providerId;
        const name = provider
          ? (catalog?.providers.find((entry) => entry.id === provider)?.name ??
            provider)
          : null;
        return name ? `${result.symbol}: ${name}` : null;
      })
      .filter((entry): entry is string => Boolean(entry))
      .join(tt("app.joiner.slash")) || resultSourceLabel;
  const failedReturnStep: AcquisitionWizardStep = fieldErrors.assetClass
    ? 1
    : fieldErrors.market || fieldErrors.source || fieldErrors.thirdPartyUse
      ? 2
      : fieldErrors.symbols
        ? 3
        : 4;
  const statusErrorText =
    runtimeErrorText ||
    Object.values(fieldErrors).find((message): message is string =>
      Boolean(message),
    ) ||
    tt("appText.marketDataAcquisitionJobFailed");

  const validationDetail = useMemo(
    () =>
      job?.error
        ? readMarketDataAcquisitionValidationDetail(
            job.error.code,
            job.error.args,
          )
        : null,
    [job],
  );

  const estimatedRows = useMemo(
    () =>
      projectMarketDataAcquisitionRowEstimate({
        startDate,
        endDate,
        timeframe,
        marketId: selectedMarket?.id ?? null,
      }),
    [startDate, endDate, timeframe, selectedMarket],
  );
  const rangeEstimateWarning =
    estimatedRows !== null && estimatedRows > MARKET_DATA_ACQUISITION_MAX_ROWS
      ? ttf("appText.marketDataAcquisitionRangeEstimateWarning", [
          estimatedRows.toLocaleString(locale),
        ])
      : null;

  const mergedDuplicates = job?.staging?.mergedDuplicateBars ?? 0;
  const usesInstrumentSelectionLayout =
    phase === "FORM" && !showHistory && !runtimeErrorText && wizardStep === 3;

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-market-data-acquisition">
      <StandardModalFrame
        title={
          <div className="market-data-acquisition-header-content">
            <div className="market-data-acquisition-title-row">
              <h1>{tt("appText.marketDataAcquisitionDialogTitle")}</h1>
              {phase === "FORM" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="market-data-acquisition-history-trigger"
                  aria-label={
                    showHistory
                      ? tt("appText.marketDataAcquisitionHistoryBack")
                      : tt("appText.marketDataAcquisitionHistoryTitle")
                  }
                  aria-expanded={showHistory}
                  title={
                    showHistory
                      ? tt("appText.marketDataAcquisitionHistoryBack")
                      : tt("appText.marketDataAcquisitionHistoryTitle")
                  }
                  onClick={() => {
                    setShowHistory((current) => !current);
                    setRuntimeErrorText("");
                  }}
                >
                  <VendorIcon
                    name={showHistory ? "chevronLeft" : "clock"}
                    aria-hidden="true"
                  />
                </Button>
              ) : null}
            </div>
            {phase === "FORM" && !showHistory ? (
              <MarketDataAcquisitionStepper tt={tt} wizardStep={wizardStep} />
            ) : null}
          </div>
        }
        variant="workflow"
        className="market-data-acquisition-dialog"
        headerClassName="market-data-acquisition-header"
        bodyClassName={`market-data-acquisition-body${
          usesInstrumentSelectionLayout
            ? " market-data-acquisition-body--instrument-selection"
            : ""
        }`}
        footerClassName="market-data-acquisition-footer"
        actions={
          <MarketDataAcquisitionActionBars
            assetClassId={assetClassId}
            canStartOnline={canStartOnline}
            catalogLoading={catalogLoading}
            failedReturnStep={failedReturnStep}
            folderGrantId={folderGrant?.grantId ?? null}
            hasInstruments={selectedInstruments.length > 0}
            importRequestPending={importRequestPending}
            isImportEntryBlocked={isImportEntryBlocked}
            phase={phase}
            savedOutputFinalPath={savedOutput?.finalPath ?? null}
            selectedMarketPresent={Boolean(selectedMarket)}
            selectedPlanAvailable={Boolean(selectedPlan?.available)}
            thirdPartyUseConfirmed={thirdPartyUseConfirmed}
            tt={tt}
            wizardStep={wizardStep}
            onCancelDownload={() => void cancelDownload()}
            onChooseFolder={() => void chooseTargetFolder()}
            onMoveToStep={moveToStep}
            onOpenFolder={() => {
              if (savedOutput?.finalPath) {
                void api.openLocalPath(savedOutput.finalPath);
              }
            }}
            onRequestClose={requestClose}
            onRetrySave={retrySave}
            onReturnToForm={returnToForm}
            onReviewAndImport={reviewAndImport}
            onStartDownload={() => void startDownload()}
          />
        }
      >
        {phase === "SAVED" && runtimeErrorText ? (
          <div className="market-data-acquisition-error" role="alert">
            <VendorIcon name="alertTriangle" aria-hidden="true" />
            <span>{runtimeErrorText}</span>
          </div>
        ) : null}

        {phase === "FORM" ? (
          showHistory ? (
            <MarketDataAcquisitionHistory
              jobs={historyJobs}
              loading={historyLoading}
              locale={locale}
              tt={tt}
              ttf={ttf}
              onRemove={(jobId) => void removeHistoryJob(jobId)}
              onResume={(entry) => void resumeHistoryJob(entry)}
            />
          ) : (
            <MarketDataAcquisitionWizard
              adjustment={adjustment}
              assetClassId={assetClassId}
              catalog={catalog}
              catalogLoading={catalogLoading}
              endDate={endDate}
              fieldErrors={fieldErrors}
              folderGrant={folderGrant}
              headingRef={stepHeadingRef}
              locale={locale}
              market={selectedMarket}
              rangeEstimateWarning={rangeEstimateWarning}
              selectedInstruments={selectedInstruments}
              sourcePlanId={sourcePlanId}
              startDate={startDate}
              thirdPartyUseConfirmed={thirdPartyUseConfirmed}
              timeframe={timeframe}
              tt={tt}
              ttf={ttf}
              wizardStep={wizardStep}
              onAdjustmentChange={(value) => {
                setAdjustment(value);
                clearFieldError("timeframe");
              }}
              onAssetClassChange={chooseAssetClass}
              onChooseFolder={() => void chooseTargetFolder()}
              onEndDateChange={(value) => {
                setEndDate(value);
                clearFieldError("endDate");
              }}
              onInstrumentsChange={(values) => {
                setSelectedInstruments(values);
                clearFieldError("symbols");
              }}
              onMarketChange={chooseMarket}
              onOpenProject={openProjectUrl}
              onRetryCatalog={() => void loadCatalog()}
              onSourcePlanChange={chooseSourcePlan}
              onStartDateChange={(value) => {
                setStartDate(value);
                clearFieldError("startDate");
                clearFieldError("endDate");
              }}
              onThirdPartyUseConfirmedChange={(value) => {
                setThirdPartyUseConfirmed(value);
                if (value) clearFieldError("thirdPartyUse");
              }}
              onTimeframeChange={(value) => {
                setTimeframe(value);
                clearFieldError("timeframe");
              }}
            />
          )
        ) : phase === "SAVED" && savedOutput ? (
          <>
            <MarketDataAcquisitionResult
              endDate={endDate}
              fileCount={savedOutput.copiedFiles}
              formattedBytes={formatStorageBytes(savedOutput.copiedBytes)}
              instrumentCount={
                job?.request.symbols.length ?? selectedInstruments.length
              }
              outputPath={savedOutput.finalPath}
              sourceLabel={actualSourceLabel}
              startDate={startDate}
              timeframe={timeframe}
              tt={tt}
              ttf={ttf}
            />
            {mergedDuplicates > 0 ? (
              <p className="market-data-acquisition-merged-note" role="status">
                {ttf("appText.marketDataAcquisitionMergedDuplicates", [
                  mergedDuplicates,
                ])}
              </p>
            ) : null}
          </>
        ) : (
          <MarketDataAcquisitionStatePage
            job={job}
            phase={phase}
            progressPercent={progressPercent}
            runtimeErrorText={runtimeErrorText}
            statusErrorText={statusErrorText}
            tt={tt}
            ttf={ttf}
            validationDetail={validationDetail}
          />
        )}
      </StandardModalFrame>
    </section>
  );
};
