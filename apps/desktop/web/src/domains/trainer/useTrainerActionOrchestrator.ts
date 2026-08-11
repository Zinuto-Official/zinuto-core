// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useRef, useState } from 'react';
import { hasApiErrorCode } from '@/api';
import { barsPerSecondToIntervalMs } from '@/domains/trainer/autoplayRate';
import {
  endTrainerPerfSpan,
  ensureTrainerHotInteractionInput,
  installTrainerHotInteractionLongTaskObserver,
  markTrainerHotInteractionChartPaint,
  recordTrainerHotInteractionMetric,
  startTrainerPerfSpan,
} from '@/domains/trainer/trainerPerfTrace';
import { resolveExecutedOrderEstimate } from '@/domains/trainer/trainerExecutedOrderEstimate';
import {
  ORDER_ACTION_ROUNDTRIP_SPAN,
  STEP_ACTION_ROUNDTRIP_SPAN,
  type TrainerHotActionName,
  type TrainerHotActionState,
  type TrainerActionSide as Side,
  type TrainerOrderPriceMode as OrderPriceMode,
  type TrainerSessionRuntimeResult as SessionRuntimeResult,
  type UseTrainerActionOrchestratorParams,
} from '@/domains/trainer/trainerActionOrchestratorTypes';
import {
  EMPTY_TRAINER_HOT_BUTTON_DISPLAY,
  hasTrainerOrderButtonPendingWork,
} from '@/domains/trainer/trainerOrderActionDisplay';
import {
  normalizeForcedLiquidationCount,
  nowMs,
  resolveActionErrorMessage,
} from '@/domains/trainer/trainerActionRuntimeHelpers';

const shouldStopAutoplayForStepResult = (
  result: SessionRuntimeResult,
): boolean => {
  const runtimeDelta = result.runtimeDelta as {
    hasFutureBars?: unknown;
    termination?: { isTerminated?: unknown };
  } | null;
  if (runtimeDelta?.termination?.isTerminated) {
    return true;
  }
  return runtimeDelta?.hasFutureBars === false;
};

type TrainerAdvanceOneBarSource = 'manual' | 'autoplay';

export const useTrainerActionOrchestrator = ({
  sessionId,
  trainerDisplayPeriod,
  autoplayBarsPerSec,
  isAutoplay,
  buyPriceMode,
  buyTradeInputMode,
  buyLotInput,
  buyAmountInput,
  buyRatioInput,
  sellPriceMode,
  sellTradeInputMode,
  sellLotInput,
  sellAmountInput,
  sellRatioInput,
  trainingTerminationReasonCode,
  appIsMountedRef,
  playingLockRef,
  isPlacingOrderRef,
  parseNumeric,
  tt,
  ttf,
  formatMoney,
  formatTradeQuantityText,
  estimateOrder,
  apiExecuteSessionAction,
  apiSetPlayback,
  refreshSnapshot,
  commitSessionRuntimePatch,
  resolveFillCursor,
  setHint,
  setError,
  setIsAutoplay,
  onTrainingTerminated,
  showNotice,
}: UseTrainerActionOrchestratorParams) => {
  const latestSessionIdRef = useRef(sessionId);
  const actionInFlightRef = useRef(false);
  const playbackRequestVersionRef = useRef(0);
  const activeActionRef = useRef<TrainerHotActionName | null>(null);
  const [hotActionState, setHotActionState] = useState<TrainerHotActionState>(
    EMPTY_TRAINER_HOT_BUTTON_DISPLAY,
  );

  useEffect(() => {
    latestSessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    installTrainerHotInteractionLongTaskObserver();
  }, []);

  const isCurrentSession = useCallback(
    (targetSessionId: string): boolean =>
      appIsMountedRef.current &&
      latestSessionIdRef.current === targetSessionId,
    [appIsMountedRef],
  );

  const publishHotActionState = useCallback(() => {
    const next: TrainerHotActionState = {
      activeAction: activeActionRef.current,
      isOrderInFlight: Boolean(isPlacingOrderRef.current),
      queuedOrderCount: 0,
    };
    setHotActionState((current) =>
      current.activeAction === next.activeAction &&
      current.isOrderInFlight === next.isOrderInFlight &&
      current.queuedOrderCount === next.queuedOrderCount
        ? current
        : next,
    );
  }, [isPlacingOrderRef]);

  const beginAction = useCallback(
    (action: TrainerHotActionName, sessionIdForAction: string): boolean => {
      if (!sessionIdForAction || !appIsMountedRef.current || actionInFlightRef.current) {
        return false;
      }
      actionInFlightRef.current = true;
      activeActionRef.current = action;
      playingLockRef.current = true;
      if (action === 'BUY' || action === 'SELL') {
        isPlacingOrderRef.current = true;
      }
      publishHotActionState();
      return true;
    },
    [appIsMountedRef, isPlacingOrderRef, playingLockRef, publishHotActionState],
  );

  const endAction = useCallback(
    (action: TrainerHotActionName) => {
      if (action === 'BUY' || action === 'SELL') {
        isPlacingOrderRef.current = false;
      }
      playingLockRef.current = false;
      activeActionRef.current = null;
      actionInFlightRef.current = false;
      publishHotActionState();
    },
    [isPlacingOrderRef, playingLockRef, publishHotActionState],
  );

  const commitRuntimePatchForCurrentSession = useCallback(
    (
      targetSessionId: string,
      result: SessionRuntimeResult,
      options: { appendFillsFromPrevious?: boolean } = {},
    ): boolean => {
      if (!isCurrentSession(targetSessionId)) {
        return false;
      }
      commitSessionRuntimePatch(result, options);
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          markTrainerHotInteractionChartPaint('STEP');
        });
      }
      return true;
    },
    [commitSessionRuntimePatch, isCurrentSession],
  );

  const advanceOneTrainerBar = useCallback(async ({
    source,
  }: {
    source: TrainerAdvanceOneBarSource;
  }) => {
    const normalizedSessionId = String(latestSessionIdRef.current || '').trim();
    if (!normalizedSessionId || !appIsMountedRef.current) {
      return { shouldContinue: false };
    }
    if (trainingTerminationReasonCode) {
      if (source === 'autoplay') {
        setIsAutoplay(false);
      }
      await onTrainingTerminated(trainingTerminationReasonCode);
      return { shouldContinue: false };
    }
    if (actionInFlightRef.current) {
      return { shouldContinue: source === 'autoplay' };
    }
    if (!beginAction('STEP', normalizedSessionId)) {
      return { shouldContinue: source === 'autoplay' };
    }
    const fillCursor = resolveFillCursor();
    ensureTrainerHotInteractionInput('STEP', 'command');
    startTrainerPerfSpan(STEP_ACTION_ROUNDTRIP_SPAN, {
      displayPeriod: trainerDisplayPeriod,
    });
    const bridgeStartedAtMs = nowMs();
    try {
      const result = await apiExecuteSessionAction(normalizedSessionId, {
        action: 'STEP',
        displayPeriod: trainerDisplayPeriod,
        fillCursor,
      });
      recordTrainerHotInteractionMetric({
        name: 'bridge',
        action: 'STEP',
        source: 'bridge',
        durationMs: nowMs() - bridgeStartedAtMs,
      });
      if (!commitRuntimePatchForCurrentSession(normalizedSessionId, result, {
        appendFillsFromPrevious: Boolean(fillCursor),
      })) {
        return { shouldContinue: false };
      }
      if (source === 'autoplay' && shouldStopAutoplayForStepResult(result)) {
        setIsAutoplay(false);
        return { shouldContinue: false };
      }
      const forcedLiquidationCount = normalizeForcedLiquidationCount(result);
      if (forcedLiquidationCount > 0) {
        showNotice(
          tt('appText.maintenanceMarginInsufficientPositionsAutoLiquidated'),
          tt('appText.notice'),
          2000,
        );
      }
      return { shouldContinue: true };
    } catch (err) {
      if (isCurrentSession(normalizedSessionId)) {
        setError(resolveActionErrorMessage(err, tt('appText.advancePlayback')));
        if (source === 'autoplay') {
          setIsAutoplay(false);
          await refreshSnapshot(normalizedSessionId);
        }
      }
      return { shouldContinue: false };
    } finally {
      endTrainerPerfSpan(STEP_ACTION_ROUNDTRIP_SPAN, {
        displayPeriod: trainerDisplayPeriod,
      });
      endAction('STEP');
    }
  }, [
    apiExecuteSessionAction,
    appIsMountedRef,
    commitRuntimePatchForCurrentSession,
    beginAction,
    endAction,
    isCurrentSession,
    onTrainingTerminated,
    refreshSnapshot,
    resolveFillCursor,
    setError,
    setIsAutoplay,
    showNotice,
    trainingTerminationReasonCode,
    trainerDisplayPeriod,
    tt,
  ]);

  const stepNext = useCallback(async () => {
    await advanceOneTrainerBar({ source: 'manual' });
  }, [advanceOneTrainerBar]);

  const autoplayStep = useCallback(
    () => advanceOneTrainerBar({ source: 'autoplay' }),
    [advanceOneTrainerBar],
  );

  const undo = useCallback(async () => {
    const normalizedSessionId = String(latestSessionIdRef.current || '').trim();
    if (!beginAction('UNDO', normalizedSessionId)) {
      return;
    }
    try {
      const result = await apiExecuteSessionAction(normalizedSessionId, {
        action: 'UNDO',
        displayPeriod: trainerDisplayPeriod,
        fillCursor: null,
      });
      if (commitRuntimePatchForCurrentSession(normalizedSessionId, result, {
        appendFillsFromPrevious: false,
      })) {
        setHint(tt('appText.undo'));
      }
    } catch (err) {
      if (isCurrentSession(normalizedSessionId)) {
        setError(resolveActionErrorMessage(err, tt('appText.undoStepsAvailable')));
      }
    } finally {
      endAction('UNDO');
    }
  }, [
    apiExecuteSessionAction,
    commitRuntimePatchForCurrentSession,
    beginAction,
    endAction,
    isCurrentSession,
    setError,
    setHint,
    trainerDisplayPeriod,
    tt,
  ]);

  const placeOrder = useCallback(async (side: Side) => {
    if (hasTrainerOrderButtonPendingWork({
      activeAction: activeActionRef.current,
      isOrderInFlight: Boolean(isPlacingOrderRef.current),
      queuedOrderCount: 0,
    })) {
      publishHotActionState();
      return;
    }
    const normalizedSessionId = String(latestSessionIdRef.current || '').trim();
    if (isAutoplay && normalizedSessionId && appIsMountedRef.current) {
      setIsAutoplay(false);
      const intervalMs = barsPerSecondToIntervalMs(autoplayBarsPerSec, parseNumeric);
      try {
        const result = await apiSetPlayback(
          normalizedSessionId,
          intervalMs,
          true,
          trainerDisplayPeriod,
        );
        commitRuntimePatchForCurrentSession(normalizedSessionId, result);
      } catch {
        if (appIsMountedRef.current) {
          setError(tt('appText.setUpAutoplay'));
        }
      }
    }
    if (!beginAction(side, normalizedSessionId)) {
      return;
    }
    const orderPriceMode: OrderPriceMode = side === 'BUY' ? buyPriceMode : sellPriceMode;
    const estimate = estimateOrder(side);
    const orderInput =
      side === 'BUY'
        ? {
            inputMode: buyTradeInputMode,
            lotInput: buyLotInput,
            amountInput: buyAmountInput,
            ratioInput: buyRatioInput,
          }
        : {
            inputMode: sellTradeInputMode,
            lotInput: sellLotInput,
            amountInput: sellAmountInput,
            ratioInput: sellRatioInput,
          };
    const fillCursor = resolveFillCursor();
    setError('');
    ensureTrainerHotInteractionInput(side, 'command');
    startTrainerPerfSpan(ORDER_ACTION_ROUNDTRIP_SPAN, {
      action: side,
      priceMode: orderPriceMode,
      displayPeriod: trainerDisplayPeriod,
    });
    try {
      const result = await apiExecuteSessionAction(normalizedSessionId, {
        action: side,
        ...orderInput,
        priceMode: orderPriceMode,
        displayPeriod: trainerDisplayPeriod,
        fillCursor,
      });
      if (!commitRuntimePatchForCurrentSession(normalizedSessionId, result, {
        appendFillsFromPrevious: Boolean(fillCursor),
      })) {
        return;
      }
      const executedEstimate =
        resolveExecutedOrderEstimate(result, side) ?? estimate;
      setHint(
        ttf('appText.value0OrderPlacedValue1EstimatedCashEffectValue2Value3', [
          side === 'BUY' ? tt('appText.buy3') : tt('appText.sell3'),
          formatTradeQuantityText(executedEstimate.qty),
          formatMoney(executedEstimate.cashEffect),
          tt('appText.advanced1BarPeriod'),
        ]),
      );
      const forcedLiquidationCount = normalizeForcedLiquidationCount(result);
      if (forcedLiquidationCount > 0) {
        showNotice(
          tt('appText.maintenanceMarginInsufficientPositionsAutoLiquidated'),
          tt('appText.notice'),
          2000,
        );
      }
    } catch (err) {
      if (!isCurrentSession(normalizedSessionId)) {
        return;
      }
      if (hasApiErrorCode(err, 'ORDER_BLOCKED')) {
        await refreshSnapshot(normalizedSessionId);
        if (isCurrentSession(normalizedSessionId)) {
          setHint(resolveActionErrorMessage(err, tt('appText.order')));
        }
        return;
      }
      setError(resolveActionErrorMessage(err, tt('appText.order')));
    } finally {
      endTrainerPerfSpan(ORDER_ACTION_ROUNDTRIP_SPAN, {
        action: side,
        priceMode: orderPriceMode,
        displayPeriod: trainerDisplayPeriod,
      });
      endAction(side);
    }
  }, [
    apiExecuteSessionAction,
    apiSetPlayback,
    appIsMountedRef,
    commitRuntimePatchForCurrentSession,
    autoplayBarsPerSec,
    beginAction,
    buyAmountInput,
    buyLotInput,
    buyPriceMode,
    buyRatioInput,
    buyTradeInputMode,
    endAction,
    estimateOrder,
    formatMoney,
    formatTradeQuantityText,
    isAutoplay,
    isCurrentSession,
    isPlacingOrderRef,
    parseNumeric,
    publishHotActionState,
    refreshSnapshot,
    resolveFillCursor,
    sellAmountInput,
    sellLotInput,
    sellPriceMode,
    sellRatioInput,
    sellTradeInputMode,
    setError,
    setHint,
    setIsAutoplay,
    showNotice,
    trainerDisplayPeriod,
    tt,
    ttf,
  ]);

  const toggleAutoplay = useCallback(async () => {
    const normalizedSessionId = String(latestSessionIdRef.current || '').trim();
    if (!normalizedSessionId || !appIsMountedRef.current) {
      return;
    }
    if (trainingTerminationReasonCode) {
      await onTrainingTerminated(trainingTerminationReasonCode);
      return;
    }

    const next = !isAutoplay;
    const intervalMs = barsPerSecondToIntervalMs(autoplayBarsPerSec, parseNumeric);
    const requestVersion = playbackRequestVersionRef.current + 1;
    playbackRequestVersionRef.current = requestVersion;

    setIsAutoplay(next);
    setHint(next ? tt('appText.autoplay') : tt('appText.autoplayPaused'));
    void apiSetPlayback(
      normalizedSessionId,
      intervalMs,
      !next,
      trainerDisplayPeriod,
    )
      .then((result) => {
        if (
          !isCurrentSession(normalizedSessionId) ||
          playbackRequestVersionRef.current !== requestVersion
        ) {
          return;
        }
        commitSessionRuntimePatch(result, { appendFillsFromPrevious: false });
      })
      .catch(() => {
        if (
          !isCurrentSession(normalizedSessionId) ||
          playbackRequestVersionRef.current !== requestVersion
        ) {
          return;
        }
        setError(tt('appText.setUpAutoplay'));
      });
  }, [
    apiSetPlayback,
    appIsMountedRef,
    commitSessionRuntimePatch,
    autoplayBarsPerSec,
    isAutoplay,
    isCurrentSession,
    onTrainingTerminated,
    parseNumeric,
    setError,
    setHint,
    setIsAutoplay,
    trainerDisplayPeriod,
    trainingTerminationReasonCode,
    tt,
  ]);

  return { stepNext, autoplayStep, undo, placeOrder, toggleAutoplay, hotActionState };
};
