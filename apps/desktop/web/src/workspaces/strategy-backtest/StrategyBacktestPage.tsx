// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type ApiBacktestBatch } from "@/api";
import type { DesktopBacktestSignalRules } from "@zinuto/shared/contracts-desktop/api";
import { VendorIcon } from "@/assets/graphics";
import { useI18n } from "@/frontend-kernel/i18n";
import { Button } from "@/ui/primitives/button";
import { Badge } from "@/ui/primitives/badge";
import { Input } from "@/ui/primitives/input";
import { DatePicker } from "@/ui/primitives/date-picker";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { SelectField } from "@/ui/primitives/select-field";
import {
  WorkspaceFrameShell,
  WorkspacePageShell,
  WorkspaceSection,
} from "@/ui/components";
import type { HistoryReplayChartViewProps } from "@/domains/chart/HistoryReplayChart";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { TradingAssetClassId } from "@/domains/trainer/tradingMarketPresets";
import {
  hydrateSavedIndicatorProfilesFromDatabase,
  readSavedIndicatorProfiles,
  subscribeSavedIndicatorProfilesChange,
  type SavedIndicatorProfile,
} from "@/domains/custom-indicator/indicator/profileStore";
import {
  readCustomIndicatorSystemDefaults,
  type CustomIndicatorSystemDefaultTemplate,
} from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";
import { SignalRuleBuilder } from "@/workspaces/strategy-backtest/SignalRuleBuilder";
import { buildDefaultSignalRules } from "@/workspaces/strategy-backtest/strategyBacktestSignalRuleDefaults";
import {
  buildStrategyBacktestIndicatorSources,
  resolveStrategyBacktestIndicatorSelection,
} from "@/workspaces/strategy-backtest/strategyIndicatorSources";
import { buildStrategyBacktestTradingSettingsFromPanel } from "@/workspaces/strategy-backtest/strategyBacktestTradingEnvironment";
import { resolveStrategyBacktestPoolSelection } from "@/workspaces/strategy-backtest/strategyBacktestUniverse";
import {
  buildIndicatorSignalMetadata,
  EMPTY_INDICATOR_SIGNAL_METADATA,
  hasSignalRules,
  type IndicatorSignalMetadata,
  sanitizeSignalRules,
  signalRulesEqual,
} from "@/workspaces/strategy-backtest/strategyBacktestSignalRules";
import type { StrategyBacktestSamplePool } from "@/workspaces/strategy-backtest/strategyBacktestTypes";
import { useStrategyBacktestTradingEnvironment } from "@/workspaces/strategy-backtest/useStrategyBacktestTradingEnvironment";
import { useStrategyBacktestResultDetailWindow } from "@/workspaces/strategy-backtest/useStrategyBacktestResultDetailWindow";
import { useStrategyBacktestBatchDeletion } from "@/workspaces/strategy-backtest/useStrategyBacktestBatchDeletion";
import { BacktestRunNoticeModal } from "@/workspaces/strategy-backtest/BacktestRunNoticeModal";
import {
  DEFAULT_INITIAL_CAPITAL,
  DEFAULT_ORDER_AMOUNT,
  createDefaultBacktestBatchName,
  formatBacktestStatus,
  formatIssueReason,
  formatMoneyInput,
  isRunningStatus,
  mergeBacktestBatchUpdate,
  parseMoneyInput,
  readProgressPollDelayMs,
  readSymbolIssues,
  resolveBacktestStatusBadgeVariant,
  toBacktestEndTime,
  toBacktestStartTime,
} from "@/workspaces/strategy-backtest/strategyBacktestDisplay";
import { StrategyBacktestEnvironmentModal } from "@/workspaces/strategy-backtest/StrategyBacktestEnvironmentModal";
import { useStrategyBacktestDatasetPeriod } from "@/workspaces/strategy-backtest/useStrategyBacktestDatasetPeriod";
import { isValidStrategyBacktestDateInput } from "@/workspaces/strategy-backtest/strategyBacktestDatasetRange";
import type { TrainerMarketPresetEditorModel } from "@/workspaces/trainer/TrainerMarketPresetInlinePanel";
import { useStrategyBacktestBatchRenderers } from "@/workspaces/strategy-backtest/useStrategyBacktestBatchRenderers";

export type StrategyBacktestPageProps = {
  isActive: boolean;
  enabledSamplePools: StrategyBacktestSamplePool[];
  tradingPresetEditor: TrainerMarketPresetEditorModel;
  trainerDisplayPeriod: DisplayPeriodKey;
  trainerPeriodOptionsByBase: HistoryReplayChartViewProps["trainerPeriodOptionsByBase"];
  chartRenderMode: NonNullable<HistoryReplayChartViewProps["chartRenderMode"]>;
};

export const StrategyBacktestPage = ({
  isActive,
  enabledSamplePools,
  tradingPresetEditor,
  trainerDisplayPeriod,
  trainerPeriodOptionsByBase,
  chartRenderMode,
}: StrategyBacktestPageProps) => {
  const { t, locale, formatNumber, formatDateTime } = useI18n();
  const [batchName, setBatchName] = useState(() =>
    createDefaultBacktestBatchName(),
  );
  const [savedIndicatorProfiles, setSavedIndicatorProfiles] = useState<
    SavedIndicatorProfile[]
  >(() => readSavedIndicatorProfiles());
  const [systemIndicatorTemplates, setSystemIndicatorTemplates] = useState<
    CustomIndicatorSystemDefaultTemplate[]
  >([]);
  const [selectedStrategyProfileId, setSelectedStrategyProfileId] =
    useState("");
  const [isLoadingIndicatorProfiles, setIsLoadingIndicatorProfiles] =
    useState(false);
  const [initialCapitalInput, setInitialCapitalInput] = useState("100,000");
  const [orderAmountInput, setOrderAmountInput] = useState("10,000");
  const [backtestStartDateInput, setBacktestStartDateInput] = useState("");
  const [backtestEndDateInput, setBacktestEndDateInput] = useState("");
  const [priceMode, setPriceMode] = useState<"NEXT_OPEN" | "CUR_CLOSE">(
    "NEXT_OPEN",
  );
  const [signalRules, setSignalRules] = useState<DesktopBacktestSignalRules>(
    {},
  );
  const [indicatorSignalMetadata, setIndicatorSignalMetadata] =
    useState<IndicatorSignalMetadata>(EMPTY_INDICATOR_SIGNAL_METADATA);
  const [selectedPoolId, setSelectedPoolId] = useState("");
  const [batches, setBatches] = useState<ApiBacktestBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [issueDetailsBatchId, setIssueDetailsBatchId] = useState<string | null>(
    null,
  );

  const { selectedPool, selectedPoolUniverse } =
    resolveStrategyBacktestPoolSelection(enabledSamplePools, selectedPoolId);
  const { periodText: selectedBacktestPeriodText } =
    useStrategyBacktestDatasetPeriod({
      pool: selectedPool,
      startDate: backtestStartDateInput,
      endDate: backtestEndDateInput,
      onStartDateChange: setBacktestStartDateInput,
      onEndDateChange: setBacktestEndDateInput,
    });
  const trainerSettingsPanel = tradingPresetEditor.trainerSettingsPanel;
  const tradingSettingsText = tradingPresetEditor.tradingSettingsText;
  const allowShortSelling = trainerSettingsPanel.allowShortSelling;
  const {
    selectedTradingEnvironmentPresetId,
    tradingEnvironmentAssetOptions,
    tradingEnvironmentPresetOptions,
    tradingEnvironmentSummary,
    handleTradingEnvironmentAssetClassChange,
    handleTradingEnvironmentPresetChange,
    isTradingEnvironmentModalOpen,
    openTradingEnvironmentModal,
    closeTradingEnvironmentModal,
    saveTradingEnvironmentModal,
  } = useStrategyBacktestTradingEnvironment({
    selectedPool,
    trainerSettingsPanel,
    tradingSettingsText,
  });

  const availableStrategyProfiles = useMemo(
    () =>
      buildStrategyBacktestIndicatorSources({
        savedProfiles: savedIndicatorProfiles,
        systemTemplates: systemIndicatorTemplates,
      }),
    [savedIndicatorProfiles, systemIndicatorTemplates],
  );

  const { selectedStrategyProfile, strategyProfileOptions } =
    resolveStrategyBacktestIndicatorSelection(
      availableStrategyProfiles,
      selectedStrategyProfileId,
    );
  const { openBatchDetailWindow } = useStrategyBacktestResultDetailWindow({
    chartRenderMode,
    selectedStrategyProfile,
    trainerDisplayPeriod,
    trainerPeriodOptionsByBase,
  });

  useEffect(() => {
    if (!selectedPoolId && enabledSamplePools[0]?.id) {
      setSelectedPoolId(enabledSamplePools[0].id);
    }
  }, [enabledSamplePools, selectedPoolId]);

  useEffect(() => {
    if (
      selectedStrategyProfile &&
      selectedStrategyProfile.id !== selectedStrategyProfileId
    ) {
      setSelectedStrategyProfileId(selectedStrategyProfile.id);
      return;
    }
    if (!selectedStrategyProfile && selectedStrategyProfileId) {
      setSelectedStrategyProfileId("");
    }
  }, [selectedStrategyProfile, selectedStrategyProfileId]);

  useEffect(() => {
    setSignalRules({});
  }, [selectedStrategyProfile?.id]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedStrategyProfile) {
      setIndicatorSignalMetadata(EMPTY_INDICATOR_SIGNAL_METADATA);
      return () => {
        cancelled = true;
      };
    }

    setIndicatorSignalMetadata({
      ...EMPTY_INDICATOR_SIGNAL_METADATA,
      isLoading: true,
    });
    void api
      .compileCustomIndicatorScript({
        source: selectedStrategyProfile.source,
        parameters: selectedStrategyProfile.parameters,
        parameterInputs: selectedStrategyProfile.parameterInputs ?? {},
        displayName: selectedStrategyProfile.name,
      })
      .then((result) => {
        if (cancelled) {
          return;
        }
        if (!result.state) {
          setIndicatorSignalMetadata(EMPTY_INDICATOR_SIGNAL_METADATA);
          return;
        }
        setIndicatorSignalMetadata({
          ...buildIndicatorSignalMetadata(result.state.compiled),
          isLoading: false,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setIndicatorSignalMetadata(EMPTY_INDICATOR_SIGNAL_METADATA);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStrategyProfile]);

  useEffect(() => {
    setSignalRules((current) => {
      const sanitized = sanitizeSignalRules(
        current,
        indicatorSignalMetadata.outputLines,
        indicatorSignalMetadata.reservedKeys,
        allowShortSelling,
      );
      if (
        hasSignalRules(sanitized) ||
        !indicatorSignalMetadata.outputLines.length
      ) {
        return signalRulesEqual(current, sanitized) ? current : sanitized;
      }
      const next = buildDefaultSignalRules({
        outputLines: indicatorSignalMetadata.outputLines,
        allowShortSelling,
        indicatorReservedKeys: indicatorSignalMetadata.reservedKeys,
      });
      return signalRulesEqual(current, next) ? current : next;
    });
  }, [
    allowShortSelling,
    indicatorSignalMetadata.outputLines,
    indicatorSignalMetadata.reservedKeys,
  ]);

  useEffect(
    () =>
      subscribeSavedIndicatorProfilesChange(() => {
        setSavedIndicatorProfiles(readSavedIndicatorProfiles());
      }),
    [],
  );

  const loadIndicatorProfiles = useCallback(async () => {
    setIsLoadingIndicatorProfiles(true);
    try {
      const profiles = await hydrateSavedIndicatorProfilesFromDatabase();
      setSavedIndicatorProfiles(profiles);
    } catch {
      setError(t("trainer.strategyBacktest.errorIndicatorLoad"));
    } finally {
      setIsLoadingIndicatorProfiles(false);
    }
  }, [t]);

  const loadSystemIndicatorTemplates = useCallback(
    async (signal?: AbortSignal) => {
      const model = await api.getWorkspaceReadModel("custom-indicator", {
        signal,
      });
      if (signal?.aborted) {
        return;
      }
      setSystemIndicatorTemplates(
        readCustomIndicatorSystemDefaults(model).templates,
      );
    },
    [],
  );

  useEffect(() => {
    if (isActive) {
      void loadIndicatorProfiles();
    }
  }, [isActive, loadIndicatorProfiles]);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    const controller = new AbortController();
    void loadSystemIndicatorTemplates(controller.signal).catch(() => {
      if (!controller.signal.aborted) {
        setSystemIndicatorTemplates([]);
      }
    });
    return () => controller.abort();
  }, [isActive, loadSystemIndicatorTemplates]);

  const selectedBatch = useMemo(
    () =>
      batches.find((batch) => batch.id === selectedBatchId) ??
      batches[0] ??
      null,
    [batches, selectedBatchId],
  );
  const issueDetailsBatch = useMemo(
    () => batches.find((batch) => batch.id === issueDetailsBatchId) ?? null,
    [batches, issueDetailsBatchId],
  );
  const {
    armedDeleteBatchId,
    disarmDeleteBatch,
    handleClearBatches,
    handleDeleteBatch,
    isClearBatchesArmed,
    isClearingBatches,
  } = useStrategyBacktestBatchDeletion({
    batches,
    isActive,
    issueDetailsBatchId,
    selectedBatchId,
    setBatches,
    setError,
    setIssueDetailsBatchId,
    setSelectedBatchId,
    t,
  });

  const loadBatches = useCallback(async () => {
    setError("");
    try {
      const nextBatches = await api.listBacktestBatches();
      setBatches(nextBatches);
      setSelectedBatchId((current) =>
        nextBatches.some((batch) => batch.id === current)
          ? current
          : (nextBatches[0]?.id ?? ""),
      );
    } catch (loadError) {
      console.error("[strategy-backtest] batch list load failed", loadError);
      setError(t("trainer.strategyBacktest.errorGeneric"));
    }
  }, [t]);

  useEffect(() => {
    if (isActive) {
      void loadBatches();
    }
  }, [isActive, loadBatches]);

  const batchesRef = useRef(batches);
  useEffect(() => {
    batchesRef.current = batches;
  }, [batches]);
  const hasRunningBatches = useMemo(
    () => batches.some((batch) => isRunningStatus(batch.status)),
    [batches],
  );

  useEffect(() => {
    if (!isActive || !hasRunningBatches) {
      return;
    }
    const controller = new AbortController();
    let timer: number | null = null;
    let scheduledDelayMs = 0;
    const pollRunningBatches = async () => {
      const runningBatches = batchesRef.current.filter((batch) =>
        isRunningStatus(batch.status),
      );
      if (!runningBatches.length || controller.signal.aborted) {
        return;
      }
      const results = await Promise.allSettled(
        runningBatches.map((batch) =>
          api.getBacktestProgress(batch.id, { signal: controller.signal }),
        ),
      );
      for (const result of results) {
        if (result.status !== "fulfilled") {
          continue;
        }
        const payload = result.value;
        setBatches((current) =>
          current.map((item) =>
            item.id === payload.batch.id
              ? mergeBacktestBatchUpdate(item, payload.batch)
              : item,
          ),
        );
      }
      if (!controller.signal.aborted) {
        reschedule();
      }
    };
    const reschedule = () => {
      const runningBatches = batchesRef.current.filter((batch) =>
        isRunningStatus(batch.status),
      );
      if (!runningBatches.length) {
        return;
      }
      const nextDelayMs = Math.min(
        ...runningBatches.map((batch) =>
          readProgressPollDelayMs(batch.progress),
        ),
      );
      if (timer !== null && scheduledDelayMs === nextDelayMs) {
        return;
      }
      if (timer !== null) {
        window.clearInterval(timer);
      }
      scheduledDelayMs = nextDelayMs;
      timer = window.setInterval(() => {
        void pollRunningBatches();
      }, nextDelayMs);
    };
    reschedule();
    return () => {
      if (timer !== null) {
        window.clearInterval(timer);
      }
      controller.abort();
    };
  }, [hasRunningBatches, isActive]);

  const handleRun = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (!selectedPool) {
      setError(t("trainer.strategyBacktest.errorNoPool"));
      return;
    }
    const instrumentIds = selectedPoolUniverse.instrumentIds;
    if (!instrumentIds.length) {
      setError(t("trainer.strategyBacktest.errorNoInstrument"));
      return;
    }
    if (!selectedStrategyProfile) {
      setError(t("trainer.strategyBacktest.errorNoIndicator"));
      return;
    }
    const initialCapital = parseMoneyInput(
      initialCapitalInput,
      DEFAULT_INITIAL_CAPITAL,
    );
    const orderAmount = parseMoneyInput(orderAmountInput, DEFAULT_ORDER_AMOUNT);
    const strategySource = selectedStrategyProfile.source.trim();
    const strategyParameterInputs = {
      ...(selectedStrategyProfile.parameterInputs ?? {}),
    };
    if (
      !isValidStrategyBacktestDateInput(backtestStartDateInput) ||
      !isValidStrategyBacktestDateInput(backtestEndDateInput) ||
      (backtestStartDateInput &&
        backtestEndDateInput &&
        backtestEndDateInput < backtestStartDateInput)
    ) {
      setError(t("trainer.strategyBacktest.errorTimeRangeInvalid"));
      return;
    }
    const tradingSettingsResult = buildStrategyBacktestTradingSettingsFromPanel(
      trainerSettingsPanel,
      initialCapital,
    );
    if (!tradingSettingsResult.ok) {
      setError(t("trainer.strategyBacktest.errorTradingEnvironment"));
      return;
    }
    const tradingSettings = tradingSettingsResult.tradingSettings;
    const submittedSignalRules = sanitizeSignalRules(
      signalRules,
      indicatorSignalMetadata.outputLines,
      indicatorSignalMetadata.reservedKeys,
      tradingSettings.allowShortSelling,
    );
    setIsSubmitting(true);
    setError("");
    try {
      const name = batchName.trim() || createDefaultBacktestBatchName();
      const batch = await api.createBacktestBatch({
        name,
        config: {
          name,
          strategySource,
          parameterInputs: strategyParameterInputs,
          instrumentIds,
          samplePoolIds: [selectedPool.id],
          ...(backtestStartDateInput
            ? { startTime: toBacktestStartTime(backtestStartDateInput) }
            : {}),
          ...(backtestEndDateInput
            ? { endTime: toBacktestEndTime(backtestEndDateInput) }
            : {}),
          initialCapital,
          priceMode,
          signalExecutionMode: priceMode,
          orderSizing: {
            mode: "FIXED_AMOUNT",
            value: orderAmount,
          },
          tradingSettings,
          ...(hasSignalRules(submittedSignalRules)
            ? { signalRules: submittedSignalRules }
            : {}),
        },
      });
      const queuedBatch = await api.runBacktestBatch(batch.id);
      setBatches((current) => [
        queuedBatch,
        ...current.filter((item) => item.id !== queuedBatch.id),
      ]);
      setSelectedBatchId(queuedBatch.id);
    } catch (runError) {
      console.error("[strategy-backtest] run failed", runError);
      setError(t("trainer.strategyBacktest.errorGeneric"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    batchName,
    backtestEndDateInput,
    backtestStartDateInput,
    indicatorSignalMetadata.outputLines,
    indicatorSignalMetadata.reservedKeys,
    initialCapitalInput,
    isSubmitting,
    orderAmountInput,
    priceMode,
    selectedPool,
    selectedStrategyProfile,
    selectedPoolUniverse.instrumentIds,
    signalRules,
    t,
    trainerSettingsPanel,
  ]);

  const handleOpenBatchDetail = useCallback(
    async (batch: ApiBacktestBatch) => {
      setSelectedBatchId(batch.id);
      setError("");
      try {
        await openBatchDetailWindow(batch);
      } catch (detailError) {
        console.error("[strategy-backtest] detail window failed", detailError);
        setError(t("trainer.strategyBacktest.errorGeneric"));
      }
    },
    [openBatchDetailWindow, t],
  );

  const handleCancelBatch = useCallback(
    async (batchId: string) => {
      setError("");
      try {
        const cancelledBatch = await api.cancelBacktestBatch(batchId);
        setBatches((current) =>
          current.map((batch) =>
            batch.id === cancelledBatch.id
              ? mergeBacktestBatchUpdate(batch, cancelledBatch)
              : batch,
          ),
        );
      } catch (cancelError) {
        console.error("[strategy-backtest] cancel failed", cancelError);
        setError(t("trainer.strategyBacktest.errorGeneric"));
      }
    },
    [t],
  );

  const issueDetailsSkippedIssues = readSymbolIssues(
    issueDetailsBatch?.summary,
    "skippedSymbols",
  );
  const issueDetailsFailedIssues = readSymbolIssues(
    issueDetailsBatch?.summary,
    "failedSymbols",
  );
  const strategyProfileEmptyLabel = isLoadingIndicatorProfiles
    ? t("trainer.strategyBacktest.loadingIndicators")
    : t("trainer.strategyBacktest.noStrategyIndicators");
  const { renderBatchIssueNotice, renderBatchState } =
    useStrategyBacktestBatchRenderers({
      t,
      formatNumber,
      setIssueDetailsBatchId,
    });

  return (
    <WorkspacePageShell
      template="workbench"
      className="strategy-backtest-page"
      bodyClassName="strategy-backtest-page-body"
    >
      <WorkspaceFrameShell className="strategy-backtest-shell">
        <section className="strategy-backtest-layout">
          <div className="strategy-backtest-config">
            <WorkspaceSection
              shell
              className="strategy-backtest-panel strategy-backtest-config-section"
              title={t("trainer.strategyBacktest.config")}
              bodyClassName="strategy-backtest-config-section-body"
            >
              <div className="strategy-backtest-config-scroll">
                <label className="strategy-backtest-field">
                  <span>{t("trainer.strategyBacktest.batchName")}</span>
                  <Input
                    value={batchName}
                    onChange={(event) => setBatchName(event.target.value)}
                  />
                </label>
                <label className="strategy-backtest-field">
                  <span className="strategy-backtest-field-label">
                    <span>{t("trainer.strategyBacktest.samplePool")}</span>
                    <small className="strategy-backtest-pool-universe">
                      {t("trainer.strategyBacktest.poolUniverseInline", {
                        count: formatNumber(
                          selectedPoolUniverse.instrumentIds.length,
                          {
                            maximumFractionDigits: 0,
                          },
                        ),
                      })}
                    </small>
                  </span>
                  <SelectField
                    className="strategy-backtest-select"
                    value={selectedPool?.id ?? ""}
                    onValueChange={setSelectedPoolId}
                    options={enabledSamplePools.map((pool) => ({
                      value: pool.id,
                      label: pool.name,
                    }))}
                  />
                </label>
                <section className="strategy-backtest-environment">
                  <div className="strategy-backtest-environment-head">
                    <div>
                      <h3>{t("trainer.strategyBacktest.environment")}</h3>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={openTradingEnvironmentModal}
                    >
                      <VendorIcon name="settings2" />
                      <span>
                        {t("trainer.strategyBacktest.environmentDetails")}
                      </span>
                    </Button>
                  </div>
                  <div className="strategy-backtest-environment-fields">
                    <label className="strategy-backtest-field">
                      <span>{tradingSettingsText.assetClassSectionTitle}</span>
                      <SegmentedControl<TradingAssetClassId>
                        className="strategy-backtest-asset-class-control"
                        size="sm"
                        value={trainerSettingsPanel.tradingAssetClass}
                        onChange={handleTradingEnvironmentAssetClassChange}
                        options={tradingEnvironmentAssetOptions}
                        gridTemplateColumns="repeat(4, minmax(0, 1fr))"
                      />
                    </label>
                    <label className="strategy-backtest-field">
                      <span>
                        {tradingSettingsText.marketPresetsSectionTitle}
                      </span>
                      <SelectField
                        className="strategy-backtest-select"
                        value={selectedTradingEnvironmentPresetId}
                        onValueChange={handleTradingEnvironmentPresetChange}
                        options={tradingEnvironmentPresetOptions}
                      />
                    </label>
                  </div>
                  <div className="strategy-backtest-environment-summary">
                    {tradingEnvironmentSummary.map((item) => (
                      <span key={item.id}>
                        <small>{item.label}</small>
                        <strong>{item.value}</strong>
                      </span>
                    ))}
                  </div>
                </section>
                <div className="strategy-backtest-inline-fields">
                  <label className="strategy-backtest-field">
                    <span>{t("trainer.strategyBacktest.initialCapital")}</span>
                    <Input
                      inputMode="decimal"
                      value={initialCapitalInput}
                      onChange={(event) =>
                        setInitialCapitalInput(event.target.value)
                      }
                      onBlur={() =>
                        setInitialCapitalInput(
                          formatMoneyInput(
                            initialCapitalInput,
                            DEFAULT_INITIAL_CAPITAL,
                            formatNumber,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="strategy-backtest-field">
                    <span>{t("trainer.strategyBacktest.orderAmount")}</span>
                    <Input
                      inputMode="decimal"
                      value={orderAmountInput}
                      onChange={(event) =>
                        setOrderAmountInput(event.target.value)
                      }
                      onBlur={() =>
                        setOrderAmountInput(
                          formatMoneyInput(
                            orderAmountInput,
                            DEFAULT_ORDER_AMOUNT,
                            formatNumber,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label className="strategy-backtest-field">
                  <span>{t("trainer.strategyBacktest.execution")}</span>
                  <SelectField
                    className="strategy-backtest-select"
                    value={priceMode}
                    onValueChange={(nextValue) =>
                      setPriceMode(nextValue as "NEXT_OPEN" | "CUR_CLOSE")
                    }
                    options={[
                      {
                        value: "NEXT_OPEN",
                        label: t("trainer.strategyBacktest.nextOpen"),
                      },
                      {
                        value: "CUR_CLOSE",
                        label: t("trainer.strategyBacktest.curClose"),
                      },
                    ]}
                  />
                </label>
                <label className="strategy-backtest-field">
                  <span>{t("trainer.strategyBacktest.strategySource")}</span>
                  <SelectField
                    className="strategy-backtest-select"
                    value={selectedStrategyProfile?.id ?? ""}
                    onValueChange={setSelectedStrategyProfileId}
                    options={strategyProfileOptions}
                    placeholder={strategyProfileEmptyLabel}
                    emptyLabel={strategyProfileEmptyLabel}
                    openWhenEmpty
                  />
                </label>
              </div>
              <div className="strategy-backtest-config-actions">
                <Button
                  type="button"
                  variant="default"
                  onClick={handleRun}
                  loading={isSubmitting}
                  disabled={!selectedPool || !selectedStrategyProfile}
                >
                  <VendorIcon name="arrowRight" />
                  <span>{t("trainer.strategyBacktest.run")}</span>
                </Button>
                {error ? (
                  <div className="strategy-backtest-error">{error}</div>
                ) : null}
              </div>
            </WorkspaceSection>
          </div>
          <WorkspaceSection
            shell
            className="strategy-backtest-panel strategy-backtest-signal-panel"
            title={t("trainer.strategyBacktest.signalRule.title")}
            actions={
              <span className="strategy-backtest-panel-status">
                {indicatorSignalMetadata.isLoading
                  ? t("trainer.strategyBacktest.signalRule.loading")
                  : t("trainer.strategyBacktest.signalRule.availableOutputs", {
                      count: indicatorSignalMetadata.outputLines.length,
                    })}
              </span>
            }
          >
            <section className="strategy-backtest-time-range">
              <div className="strategy-backtest-time-range-head">
                <h3>{t("trainer.strategyBacktest.timeRange")}</h3>
                {selectedBacktestPeriodText ? (
                  <span>{selectedBacktestPeriodText}</span>
                ) : null}
              </div>
              <div className="strategy-backtest-time-range-fields">
                <div className="strategy-backtest-field">
                  <span>{t("trainer.strategyBacktest.startDate")}</span>
                  <DatePicker
                    value={backtestStartDateInput}
                    onChange={setBacktestStartDateInput}
                    max={backtestEndDateInput || undefined}
                    allowManualInput
                    locale={locale}
                    className="w-full min-w-0"
                    aria-label={t("trainer.strategyBacktest.startDate")}
                  />
                </div>
                <div className="strategy-backtest-field">
                  <span>{t("trainer.strategyBacktest.endDate")}</span>
                  <DatePicker
                    value={backtestEndDateInput}
                    onChange={setBacktestEndDateInput}
                    min={backtestStartDateInput || undefined}
                    allowManualInput
                    locale={locale}
                    className="w-full min-w-0"
                    aria-label={t("trainer.strategyBacktest.endDate")}
                  />
                </div>
              </div>
            </section>
            <SignalRuleBuilder
              value={signalRules}
              outputLines={indicatorSignalMetadata.outputLines}
              allowShortSelling={allowShortSelling}
              indicatorReservedKeys={indicatorSignalMetadata.reservedKeys}
              isLoadingOutputs={indicatorSignalMetadata.isLoading}
              onChange={setSignalRules}
            />
          </WorkspaceSection>
          <WorkspaceSection
            shell
            className="strategy-backtest-panel strategy-backtest-batches-panel"
            title={t("trainer.strategyBacktest.batches")}
            actions={
              <Button
                type="button"
                variant="destructiveGhost"
                size="sm"
                className={
                  isClearBatchesArmed
                    ? "strategy-backtest-clear-batches is-armed"
                    : "strategy-backtest-clear-batches"
                }
                disabled={!batches.length}
                loading={isClearingBatches}
                onClick={() => void handleClearBatches()}
              >
                <VendorIcon name="trash2" />
                <span>
                  {isClearBatchesArmed
                    ? t("trainer.strategyBacktest.clearBatchesArmed")
                    : t("trainer.strategyBacktest.clearBatches")}
                </span>
              </Button>
            }
          >
            <BacktestRunNoticeModal
              open={Boolean(issueDetailsBatch)}
              skippedIssues={issueDetailsSkippedIssues}
              failedIssues={issueDetailsFailedIssues}
              title={t("trainer.strategyBacktest.issueModalTitle")}
              skippedTitle={t("trainer.strategyBacktest.issueSkippedGroup")}
              failedTitle={t("trainer.strategyBacktest.issueFailedGroup")}
              closeLabel={t("appText.close")}
              formatIssueReason={(reason) => formatIssueReason(reason, t)}
              onClose={() => setIssueDetailsBatchId(null)}
            />
            <div className="strategy-backtest-batch-list">
              {batches.map((batch) => (
                <article
                  key={batch.id}
                  className={`strategy-backtest-batch ${batch.id === selectedBatch?.id ? "is-active" : ""}`}
                  onClick={() => void handleOpenBatchDetail(batch)}
                >
                  <div className="strategy-backtest-batch-top">
                    <Button
                      type="button"
                      variant="inline"
                      size={null}
                      className="strategy-backtest-batch-open"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleOpenBatchDetail(batch);
                      }}
                    >
                      <span className="strategy-backtest-batch-head">
                        <span className="strategy-backtest-batch-main">
                          <strong>{batch.name}</strong>
                          <span className="strategy-backtest-batch-meta">
                            <small>{formatDateTime(batch.updatedAt)}</small>
                          </span>
                          {batch.status === "FAILED" && batch.errorCode ? (
                            <small className="strategy-backtest-batch-error-code">
                              {batch.errorCode}
                            </small>
                          ) : null}
                        </span>
                        <Badge
                          className="strategy-backtest-batch-status"
                          variant={resolveBacktestStatusBadgeVariant(
                            batch.status,
                          )}
                        >
                          {formatBacktestStatus(batch.status, t)}
                        </Badge>
                      </span>
                    </Button>
                    <div className="strategy-backtest-batch-card-actions">
                      {isRunningStatus(batch.status) ? (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCancelBatch(batch.id);
                          }}
                        >
                          <VendorIcon name="circle" />
                          <span>{t("trainer.strategyBacktest.stopRun")}</span>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="destructiveGhost"
                        size="sm"
                        className={
                          armedDeleteBatchId === batch.id ? "is-armed" : ""
                        }
                        onBlur={disarmDeleteBatch}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteBatch(batch.id);
                        }}
                      >
                        <VendorIcon name="trash2" />
                        <span>
                          {armedDeleteBatchId === batch.id
                            ? t("trainer.strategyBacktest.deleteArmed")
                            : t("trainer.strategyBacktest.delete")}
                        </span>
                      </Button>
                    </div>
                  </div>
                  {renderBatchState(batch)}
                  {renderBatchIssueNotice(batch)}
                </article>
              ))}
              {!batches.length ? (
                <div className="strategy-backtest-empty">
                  {t("trainer.strategyBacktest.noBatches")}
                </div>
              ) : null}
            </div>
          </WorkspaceSection>
        </section>
      </WorkspaceFrameShell>
      <StrategyBacktestEnvironmentModal
        open={isTradingEnvironmentModalOpen}
        editor={tradingPresetEditor}
        onCancel={closeTradingEnvironmentModal}
        onSave={saveTradingEnvironmentModal}
      />
    </WorkspacePageShell>
  );
};
