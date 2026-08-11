// SPDX-License-Identifier: GPL-3.0-only

import type { DisplayPeriodKey } from '@zinuto/shared/period';
import type { OhlcvBar, PriceMode } from '../../domain/models.js';
import { POSITION_EPSILON } from '../../domain/trading/orderSizing.js';
import type { PlaceOrderPayload } from './sessionOrderPlacementRuntime.js';
import type {
  createSessionOrderQuoteRuntime,
  SessionOrderRuntimeContext,
} from './sessionOrderQuoteRuntime.js';
import type {
  SessionActionRuntimeContext,
  SessionAdvancePlan,
} from './sessionTimeline.js';
import type { createReplaySessionUndoStore } from '../ports/infrastructure/db/trading/sessionUndoStore.js';
import type { PositionRow, SessionRow, TradingExecutionSettings } from '../../domain/trading/types.js';

export type ReplaySessionActionPayload =
  | {
      action: 'STEP';
      count?: number;
      displayPeriod?: DisplayPeriodKey | string;
      fillCursor?: string | null;
      occurredAt?: string;
    }
  | {
      action: 'PLAYBACK_TICK';
      displayPeriod?: DisplayPeriodKey | string;
      fillCursor?: string | null;
      occurredAt?: string;
    }
  | {
      action: 'BUY' | 'SELL';
      inputMode: 'LOT' | 'AMOUNT' | 'RATIO';
      lotInput?: string | number | null;
      amountInput?: string | number | null;
      ratioInput?: string | number | null;
      priceMode: PriceMode;
      displayPeriod?: DisplayPeriodKey | string;
      fillCursor?: string | null;
      occurredAt?: string;
    }
  | {
      action: 'UNDO';
      displayPeriod?: DisplayPeriodKey | string;
      fillCursor?: string | null;
      occurredAt?: string;
    };

export type SessionActionExecutionResult = {
  session: SessionRow;
  fillIds: string[];
  forcedLiquidationCount: number;
  runtimeContext?: SessionActionRuntimeContext;
};

type ReplaySessionUndoStore = Pick<
  ReturnType<typeof createReplaySessionUndoStore>,
  'captureDelta' | 'insertDelta'
>;

type SavepointRunner = <T>(run: () => Promise<T>) => Promise<T>;

type StepSessionCore = (
  sessionId: string,
  count?: number,
  options?: {
    targetRawIndex?: number;
    occurredAt?: string;
    maxIndex?: number;
    pendingNextOpenFillFailureMode?: 'CANCEL_AND_CONTINUE' | 'THROW';
  },
) => Promise<{
  session: SessionRow;
  fillIds: string[];
  forcedLiquidationCount: number;
}>;

type PlaceOrderCore = (
  sessionId: string,
  payload: PlaceOrderPayload,
  context?: SessionOrderRuntimeContext,
) => Promise<{
  session: SessionRow;
  fillIds: string[];
  forcedLiquidationCount: number;
}>;

type GetSessionOrderQuote = ReturnType<
  typeof createSessionOrderQuoteRuntime
>['getSessionOrderQuote'];

type SessionCashStore = {
  getSessionCashBalance: (session: SessionRow) => number;
};

type CreateSessionActionRuntimeDeps = {
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  resolveOperationIso: (value: unknown) => string;
  getSessionById: (sessionId: string) => SessionRow;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  getOrCreatePosition: (sessionId: string, instrumentId: string) => PositionRow;
  resolveSessionTradingSettings: (session: SessionRow) => TradingExecutionSettings;
  resolveSessionAdvancePlan: (
    session: SessionRow,
    displayPeriod?: string,
  ) => Promise<SessionAdvancePlan>;
  resolveKnownStepAdvanceState: ReturnType<
    typeof import('./sessionTimeline.js').createSessionTimelinePlanner
  >['resolveKnownStepAdvanceState'];
  buildRuntimeContextFromAdvancePlan: ReturnType<
    typeof import('./sessionTimeline.js').createSessionTimelinePlanner
  >['buildRuntimeContextFromAdvancePlan'];
  sessionCashStore: SessionCashStore;
  replaySessionUndoStore: ReplaySessionUndoStore;
  withSavepoint: SavepointRunner;
  stepSessionCore: StepSessionCore;
  placeOrderCore: PlaceOrderCore;
  undoReplaySessionAction: (
    sessionId: string,
    occurredAt?: string,
  ) => {
    session: SessionRow;
    fillIds: string[];
    forcedLiquidationCount: number;
  };
  pauseSessionPlayback: (session: SessionRow, occurredAt: string) => SessionRow;
  getSessionOrderQuote: GetSessionOrderQuote;
};

export const createSessionActionRuntime = ({
  appError,
  resolveOperationIso,
  getSessionById,
  getBarByIndex,
  getOrCreatePosition,
  resolveSessionTradingSettings,
  resolveSessionAdvancePlan,
  resolveKnownStepAdvanceState,
  buildRuntimeContextFromAdvancePlan,
  sessionCashStore,
  replaySessionUndoStore,
  withSavepoint,
  stepSessionCore,
  placeOrderCore,
  undoReplaySessionAction,
  pauseSessionPlayback,
  getSessionOrderQuote,
}: CreateSessionActionRuntimeDeps) => {
  const executeSessionActionCore = async (
    sessionId: string,
    payload: ReplaySessionActionPayload,
  ): Promise<SessionActionExecutionResult> => {
    const occurredAt = resolveOperationIso(payload.occurredAt);
    switch (payload.action) {
      case 'STEP':
      case 'PLAYBACK_TICK': {
        return withSavepoint(async () => {
          const session = getSessionById(sessionId);
          const displayPeriod = payload.displayPeriod ?? session.timeframe;
          const advancePlan = await resolveSessionAdvancePlan(
            session,
            displayPeriod,
          );
          const isPlaybackTick = payload.action === 'PLAYBACK_TICK';
          if (isPlaybackTick && Number(session.is_paused) !== 0) {
            const advanceState = await resolveKnownStepAdvanceState(
              session,
              advancePlan,
              session.cursor_index,
            );
            return {
              session,
              fillIds: [],
              forcedLiquidationCount: 0,
              runtimeContext: buildRuntimeContextFromAdvancePlan(
                'STEP',
                session,
                advancePlan,
                advanceState,
              ),
            };
          }
          if (payload.displayPeriod && !advancePlan.hasFutureBars) {
            const nextSession = isPlaybackTick
              ? pauseSessionPlayback(session, occurredAt)
              : session;
            const advanceState = await resolveKnownStepAdvanceState(
              nextSession,
              advancePlan,
              nextSession.cursor_index,
            );
            return {
              session: nextSession,
              fillIds: [],
              forcedLiquidationCount: 0,
              runtimeContext: buildRuntimeContextFromAdvancePlan(
                'STEP',
                nextSession,
                advancePlan,
                advanceState,
              ),
            };
          }
          const undoDelta = replaySessionUndoStore.captureDelta(sessionId);
          const stepResult = await stepSessionCore(
            sessionId,
            Math.max(
              1,
              Math.floor(
                payload.action === 'STEP' && Number.isFinite(payload.count)
                  ? Number(payload.count)
                  : 1,
              ),
            ),
            payload.displayPeriod
              ? {
                  targetRawIndex: advancePlan.stepTargetRawIndex,
                  occurredAt,
                  maxIndex: Math.max(0, Math.floor(Number(advancePlan.totalRaw) || 0) - 1),
                }
              : {
                  occurredAt,
                  maxIndex: Math.max(0, Math.floor(Number(advancePlan.totalRaw) || 0) - 1),
                },
          );
          if (
            stepResult.session.cursor_index !== session.cursor_index ||
            stepResult.fillIds.length > 0 ||
            stepResult.forcedLiquidationCount > 0
          ) {
            if (!isPlaybackTick) {
              replaySessionUndoStore.insertDelta(sessionId, 'STEP', undoDelta, occurredAt);
            }
          }
          const advanceState = await resolveKnownStepAdvanceState(
            session,
            advancePlan,
            stepResult.session.cursor_index,
          );
          const resultSession =
            isPlaybackTick && !advanceState?.nextDisplayIndex
              ? pauseSessionPlayback(stepResult.session, occurredAt)
              : stepResult.session;
          return {
            ...stepResult,
            session: resultSession,
            runtimeContext: buildRuntimeContextFromAdvancePlan(
              'STEP',
              session,
              advancePlan,
              advanceState,
            ),
          };
        });
      }
      case 'BUY':
      case 'SELL': {
        return withSavepoint(async () => {
          const session = getSessionById(sessionId);
          const displayPeriod = payload.displayPeriod ?? session.timeframe;
          const advancePlan = await resolveSessionAdvancePlan(
            session,
            displayPeriod,
          );
          const runtimeContext = buildRuntimeContextFromAdvancePlan(
            payload.action,
            session,
            advancePlan,
          );
          const resolvedNextOpenDelayBars =
            payload.priceMode === 'NEXT_OPEN'
              ? Math.max(
                  0,
                  Math.floor(
                    Number(advancePlan.nextOpenRawIndex ?? 0) -
                      Math.max(0, Math.floor(Number(session.cursor_index) || 0)),
                  ),
                )
              : 1;
          if (payload.priceMode === 'NEXT_OPEN' && resolvedNextOpenDelayBars <= 0) {
            throw appError('ORDER_BLOCKED', {
              blockedReasonCode: 'NEXT_OPEN_UNAVAILABLE',
              blockedReason: 'Next open unavailable.',
            });
          }
          const currentBar = await getBarByIndex(
            session.instrument_id,
            session.cursor_index,
          );
          if (!currentBar) {
            throw appError('CURRENT_BAR_NOT_FOUND');
          }
          const nextBar =
            payload.priceMode === 'NEXT_OPEN'
              ? await getBarByIndex(
                  session.instrument_id,
                  session.cursor_index + Math.max(1, resolvedNextOpenDelayBars),
                )
              : undefined;
          const currentPosition = getOrCreatePosition(
            session.id,
            session.instrument_id,
          );
          const sessionCashBalance = sessionCashStore.getSessionCashBalance(session);
          const sessionTradingSettings = resolveSessionTradingSettings(session);
          const orderRuntimeContext: SessionOrderRuntimeContext = {
            session,
            currentBar,
            nextBar,
            advancePlan,
            currentPosition,
            sessionCashBalance,
            sessionTradingSettings,
            barCount: advancePlan.totalRaw,
          };
          const orderQuote = await getSessionOrderQuote(sessionId, {
            side: payload.action,
            inputMode: payload.inputMode,
            lotInput: payload.lotInput,
            amountInput: payload.amountInput,
            ratioInput: payload.ratioInput,
            priceMode: payload.priceMode,
            displayPeriod,
          }, orderRuntimeContext);
          if (orderQuote.blockedReasonCode) {
            throw appError('ORDER_BLOCKED', {
              blockedReasonCode: orderQuote.blockedReasonCode,
              blockedReason: orderQuote.blockedReason ?? '',
            });
          }
          const quotedQty = Number(orderQuote.estimate.qty);
          if (!Number.isFinite(quotedQty) || quotedQty <= POSITION_EPSILON) {
            throw appError('FILL_QTY_INVALID');
          }
          const undoDelta = replaySessionUndoStore.captureDelta(sessionId);
          const orderResult = await placeOrderCore(sessionId, {
            side: payload.action,
            qty: quotedQty,
            priceMode: payload.priceMode,
            nextOpenDelayBars: orderQuote.nextOpenDelayBars,
            autoStep: false,
            occurredAt,
          }, orderRuntimeContext);
          const followupTargetRawIndex =
            payload.displayPeriod && payload.priceMode === 'NEXT_OPEN'
              ? advancePlan.nextBucket?.endRawIndex ?? session.cursor_index
              : payload.displayPeriod
                ? advancePlan.stepTargetRawIndex
                : session.cursor_index;
          if (followupTargetRawIndex <= session.cursor_index) {
            replaySessionUndoStore.insertDelta(
              sessionId,
              payload.action,
              undoDelta,
              occurredAt,
            );
            return {
              ...orderResult,
              runtimeContext,
            };
          }
          const stepResult = await stepSessionCore(
            sessionId,
            Math.max(1, followupTargetRawIndex - session.cursor_index),
            {
              targetRawIndex: followupTargetRawIndex,
              occurredAt,
              maxIndex: Math.max(0, Math.floor(Number(advancePlan.totalRaw) || 0) - 1),
              pendingNextOpenFillFailureMode: 'THROW',
            },
          );
          const actionResult = {
            session: stepResult.session,
            fillIds: [...orderResult.fillIds, ...stepResult.fillIds],
            forcedLiquidationCount:
              Math.max(0, Math.floor(Number(orderResult.forcedLiquidationCount) || 0)) +
              Math.max(0, Math.floor(Number(stepResult.forcedLiquidationCount) || 0)),
            runtimeContext,
          };
          replaySessionUndoStore.insertDelta(
            sessionId,
            payload.action,
            undoDelta,
            occurredAt,
          );
          return actionResult;
        });
      }
      case 'UNDO':
        return withSavepoint(async () => {
          const session = getSessionById(sessionId);
          const advancePlan = await resolveSessionAdvancePlan(
            session,
            payload.displayPeriod,
          );
          const result = undoReplaySessionAction(sessionId, occurredAt);
          return {
            ...result,
            runtimeContext: buildRuntimeContextFromAdvancePlan(
              'UNDO',
              session,
              advancePlan,
            ),
          };
        });
      default:
        throw appError('INVALID_PARAMS');
    }
  };

  return {
    executeSessionActionCore,
  };
};
