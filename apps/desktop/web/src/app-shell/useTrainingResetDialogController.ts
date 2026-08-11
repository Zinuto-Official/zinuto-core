// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import type { ReplayCurvePoint } from "@/domains/trainer/trainerTypes";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { formatMessage, type MessageValues } from "@zinuto/shared/i18n";
import { api, hasApiErrorCode } from "@/api";
import {
  type AppTextKey,
} from "@/frontend-kernel/i18n/messageRuntime";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type {
  SessionTerminationReasonCode,
  TrainingSummary,
} from "@/domains/training/types";
import type {
  ActionDialogState
} from "@/frontend-kernel/appTypes";
import type {
  FreeReplayEndSettlementMode,
  PriceMode,
} from "@zinuto/shared/trading";

type OrderPriceMode = PriceMode;

const toIndexedMessageValues = (values: Array<unknown> = []): MessageValues =>
  values.reduce<MessageValues>((acc, value, index) => {
    acc[String(index)] =
      value === undefined
        ? null
        : (value as string | number | boolean | null);
    return acc;
  }, {});

type UseTrainingResetDialogControllerParams = {
  actionDialog: ActionDialogState | null;
  setActionDialog: Dispatch<SetStateAction<ActionDialogState | null>>;
  tradingInitialSecuritiesBalance: number;
  displayPeriod: DisplayPeriodKey;
  buyPriceMode: OrderPriceMode;
  freeReplayEndSettlementMode: FreeReplayEndSettlementMode;
  isPreparingAction: boolean;
  setIsPreparingAction: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  archiveCurrentTrainingProject: (summary: TrainingSummary) => Promise<boolean>;
  resetAllTraining: (priceMode?: OrderPriceMode) => Promise<void>;
  currentSessionId: string;
  onSessionMissing: () => void;
  loadTrainingProjectsPage: (
    reset: boolean,
    cursor: string | null,
  ) => Promise<void>;
  language: string;
};

export type ActionDialogReplayMetrics = {
  initialCapital: number;
  finalEquity: number;
  equityReturnRate: number;
  equityCurve: ReplayCurvePoint[];
  drawdownCurve: ReplayCurvePoint[];
};

type TrainingResetDialogReadModel = {
  metrics: { initialCapital: number; finalEquity: number; equityReturnRate: number };
  terminationReason: { reasonCode: string | null; messageKey: string };
  settlementMode: 'FORCE_CLOSE' | 'CURRENT_TOTAL_ASSET';
  forcedLiquidationCount: number;
  forcedLiquidationSellCount: number;
  forcedLiquidationBuyCount: number;
  hasForcedLiquidation: boolean;
};

const buildFallbackActionDialogReplayMetrics = (
  summary: TrainingSummary | null,
  tradingInitialSecuritiesBalance: number,
): ActionDialogReplayMetrics => {
  const initialCapital = Number.isFinite(Number(summary?.initialAsset))
    ? Math.max(0, Number(summary?.initialAsset))
    : Math.max(0, tradingInitialSecuritiesBalance);
  const finalEquity = Number.isFinite(Number(summary?.endingAsset))
    ? Number(summary?.endingAsset)
    : initialCapital + Number(summary?.totalPnl ?? 0);
  const equityReturnRate = Number.isFinite(Number(summary?.assetReturnRate))
    ? Number(summary?.assetReturnRate)
    : initialCapital > 0
      ? (finalEquity - initialCapital) / initialCapital
      : 0;
  return {
    initialCapital,
    finalEquity,
    equityReturnRate,
    equityCurve: [],
    drawdownCurve: [],
  };
};

export const useTrainingResetDialogController = ({
  actionDialog,
  setActionDialog,
  tradingInitialSecuritiesBalance,
  displayPeriod,
  buyPriceMode,
  freeReplayEndSettlementMode,
  isPreparingAction,
  setIsPreparingAction,
  setError,
  archiveCurrentTrainingProject,
  resetAllTraining,
  currentSessionId,
  onSessionMissing,
  loadTrainingProjectsPage,
  language,
}: UseTrainingResetDialogControllerParams) => {
  const resolvedLanguage = language as AppUiLanguage;
  const localTt = useCallback(
    (key: AppTextKey) =>
      formatMessage(resolvedLanguage, key),
    [resolvedLanguage],
  );
  const localTtf = useCallback(
    (key: AppTextKey, values: Array<unknown> = []) =>
      formatMessage(
        resolvedLanguage,
        key,
        toIndexedMessageValues(values),
      ),
    [resolvedLanguage],
  );
  const [actionDialogReplayMetrics, setActionDialogReplayMetrics] =
    useState<ActionDialogReplayMetrics>(() =>
      buildFallbackActionDialogReplayMetrics(
        null,
        tradingInitialSecuritiesBalance,
      ),
    );
  const [resetDialogReadModel, setResetDialogReadModel] =
    useState<TrainingResetDialogReadModel | null>(null);
  const ensureCurrentSessionExists = useCallback(async (): Promise<boolean> => {
    const normalizedSessionId = String(currentSessionId || "").trim();
    if (!normalizedSessionId) {
      onSessionMissing();
      return false;
    }
    try {
      await api.getSnapshot(normalizedSessionId, null);
      return true;
    } catch (error) {
      if (hasApiErrorCode(error, "SESSION_NOT_FOUND")) {
        onSessionMissing();
        return false;
      }
      throw error;
    }
  }, [currentSessionId, onSessionMissing]);

  useEffect(() => {
    if (!actionDialog) {
      setActionDialogReplayMetrics(
        buildFallbackActionDialogReplayMetrics(
          null,
          tradingInitialSecuritiesBalance,
        ),
      );
      setResetDialogReadModel(null);
    }
  }, [actionDialog, tradingInitialSecuritiesBalance]);

  const openResetAllDialog = useCallback(
    async (options?: {
      terminationReasonCode?: SessionTerminationReasonCode | null;
    }) => {
      if (actionDialog || isPreparingAction) {
        return;
      }
      setError("");
      setIsPreparingAction(true);
      try {
        if (!(await ensureCurrentSessionExists())) {
          return;
        }
        const settlementPreview =
          await api.previewTrainingProjectSettlementFromSession({
            sessionId: String(currentSessionId || "").trim(),
            displayPeriod,
            finalizePriceMode:
              freeReplayEndSettlementMode === "FORCE_CLOSE"
                ? buyPriceMode
                : undefined,
          });
        const summary = settlementPreview.summary;
        setActionDialogReplayMetrics(settlementPreview.replayMetrics);

        // Fetch read model from local-api
        const readModel = await api.getTrainingResetDialogReadModel({
          summary: summary as unknown as Record<string, unknown>,
          settlementMode: freeReplayEndSettlementMode === "FORCE_CLOSE" ? "FORCE_CLOSE" : "CURRENT_TOTAL_ASSET",
          terminationReasonCode: options?.terminationReasonCode ?? null,
        });
        setResetDialogReadModel(readModel);

        setActionDialog({
          kind: "RESET_ALL",
          summary,
          terminationReasonCode: options?.terminationReasonCode ?? null,
        });
      } catch (err) {
        setError(localTt("appText.readStatistics"));
      } finally {
        setIsPreparingAction(false);
      }
    },
    [
      actionDialog,
      buyPriceMode,
      currentSessionId,
      displayPeriod,
      freeReplayEndSettlementMode,
      isPreparingAction,
      setActionDialog,
      setError,
      setIsPreparingAction,
      ensureCurrentSessionExists,
      localTt,
    ],
  );

  const confirmActionDialog = useCallback(async () => {
    if (!actionDialog || isPreparingAction) {
      return;
    }
    const current = actionDialog;
    setActionDialog(null);
    setIsPreparingAction(true);
    try {
      if (current.kind === "RESET_ALL") {
        if (!(await ensureCurrentSessionExists())) {
          return;
        }
        const archived = await archiveCurrentTrainingProject(current.summary);
        if (!archived) {
          return;
        }
        await resetAllTraining(
          freeReplayEndSettlementMode === "FORCE_CLOSE"
            ? buyPriceMode
            : undefined,
        );
        await loadTrainingProjectsPage(false, null);
      }
    } catch (error) {
      console.error("[trainer] Failed to confirm end-training action.", error);
      setError(localTt("appText.archiveHistoricalTraining"));
    } finally {
      setIsPreparingAction(false);
    }
  }, [
    actionDialog,
    archiveCurrentTrainingProject,
    buyPriceMode,
    freeReplayEndSettlementMode,
    isPreparingAction,
    loadTrainingProjectsPage,
    resetAllTraining,
    setActionDialog,
    setError,
    setIsPreparingAction,
    ensureCurrentSessionExists,
    localTt,
  ]);

  const actionDialogTitle = useMemo(() => {
    if (!actionDialog) {
      return "";
    }
    return localTt("appText.endTraining");
  }, [actionDialog, localTt]);

  const actionDialogDesc = useMemo(() => {
    if (!actionDialog) {
      return "";
    }
    const terminationReasonKey = resetDialogReadModel?.terminationReason.messageKey || "";
    const terminationReasonText = terminationReasonKey
      ? localTt(terminationReasonKey as AppTextKey)
      : "";
    if (freeReplayEndSettlementMode === "CURRENT_TOTAL_ASSET") {
      const base = localTt("appText.endTrainingSystemSettleTotalEquityKeepOpen");
      return terminationReasonText ? `${terminationReasonText} ${base}` : base;
    }
    const liquidateRule =
      buyPriceMode === "NEXT_OPEN" ? localTt("appText.nextBarOpenFallbackCloseIfNextBar") : localTt("appText.barClose");
    const base = localTtf("appText.endTrainingSystemForceCloseValue0SettlePnl", [liquidateRule]);
    const withTerminationPrefix = terminationReasonText
      ? `${terminationReasonText} ${base}`
      : base;
    const forcedCount = resetDialogReadModel?.forcedLiquidationCount ?? Math.max(
      0,
      Math.floor(Number(actionDialog.summary.forcedLiquidationCount ?? 0)),
    );
    if (forcedCount <= 0) {
      return withTerminationPrefix;
    }
    const forcedSellCount = resetDialogReadModel?.forcedLiquidationSellCount ?? Math.max(
      0,
      Math.floor(Number(actionDialog.summary.forcedLiquidationSellCount ?? 0)),
    );
    const forcedBuyCount = resetDialogReadModel?.forcedLiquidationBuyCount ?? Math.max(
      0,
      Math.floor(Number(actionDialog.summary.forcedLiquidationBuyCount ?? 0)),
    );
    const forcedNotice = localTtf("appText.detectedValue0OpenPositionsSellCloseValue1BuyValue2", [
      forcedCount,
      forcedSellCount,
      forcedBuyCount,
    ]);
    return `${withTerminationPrefix}\n\n${forcedNotice}`;
  }, [actionDialog, buyPriceMode, freeReplayEndSettlementMode, localTt, localTtf, resetDialogReadModel]);

  return {
    actionDialogReplayMetrics,
    openResetAllDialog,
    confirmActionDialog,
    actionDialogTitle,
    actionDialogDesc,
  };
};
