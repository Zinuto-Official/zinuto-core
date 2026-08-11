// SPDX-License-Identifier: GPL-3.0-only

import type { MutableRefObject } from 'react';
import type {
  OrderInputMode,
  OrderSide,
  PriceMode,
} from '@zinuto/shared/trading';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import type { DisplayPeriodKey } from '@/domains/chart/chartPeriods';
import type { SessionTerminationReasonCode } from '@/domains/training/types';

export type TrainerActionSide = OrderSide;
export type TrainerTradeInputMode = OrderInputMode;
export type TrainerOrderPriceMode = PriceMode;

export type TrainerOrderEstimate = {
  qty: number;
  lots: number;
  amount: number;
  cashEffect: number;
};

export type TrainerSessionRuntimeResult = {
  fillIds?: string[];
  forcedLiquidationCount?: number;
  runtimeDelta: unknown;
  chartFrame?: unknown;
};

export type TrainerHotActionName = 'STEP' | 'BUY' | 'SELL' | 'UNDO';

export type TrainerHotActionState = {
  activeAction: TrainerHotActionName | null;
  isOrderInFlight: boolean;
  queuedOrderCount: number;
};

export type UseTrainerActionOrchestratorParams = {
  sessionId: string;
  trainerDisplayPeriod: DisplayPeriodKey;
  autoplayBarsPerSec: string;
  isAutoplay: boolean;
  buyPriceMode: TrainerOrderPriceMode;
  buyTradeInputMode: TrainerTradeInputMode;
  buyLotInput: string;
  buyAmountInput: string;
  buyRatioInput: string;
  sellPriceMode: TrainerOrderPriceMode;
  sellTradeInputMode: TrainerTradeInputMode;
  sellLotInput: string;
  sellAmountInput: string;
  sellRatioInput: string;
  trainingTerminationReasonCode: SessionTerminationReasonCode | null | undefined;
  appIsMountedRef: MutableRefObject<boolean>;
  playingLockRef: MutableRefObject<boolean>;
  isPlacingOrderRef: MutableRefObject<boolean>;
  parseNumeric: (raw: string) => number;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  formatMoney: (value: number, fractionDigits?: number) => string;
  formatTradeQuantityText: (quantity: number) => string;
  estimateOrder: (side: TrainerActionSide) => TrainerOrderEstimate;
  apiExecuteSessionAction: (
    sessionId: string,
    payload:
      | {
          action: 'STEP';
          displayPeriod: DisplayPeriodKey;
          fillCursor?: string | null;
        }
      | {
          action: 'BUY' | 'SELL';
          inputMode: TrainerTradeInputMode;
          lotInput?: string | number | null;
          amountInput?: string | number | null;
          ratioInput?: string | number | null;
          priceMode: TrainerOrderPriceMode;
          displayPeriod: DisplayPeriodKey;
          fillCursor?: string | null;
        }
      | {
          action: 'UNDO';
          displayPeriod: DisplayPeriodKey;
          fillCursor?: string | null;
        },
  ) => Promise<TrainerSessionRuntimeResult>;
  apiSetPlayback: (
    sessionId: string,
    intervalMs: number,
    isPaused: boolean,
    displayPeriod?: DisplayPeriodKey,
  ) => Promise<TrainerSessionRuntimeResult>;
  refreshSnapshot: (sessionId: string) => Promise<unknown>;
  commitSessionRuntimePatch: (
    result: TrainerSessionRuntimeResult,
    options?: { appendFillsFromPrevious?: boolean },
  ) => void;
  resolveFillCursor: () => string | null;
  setHint: (message: string) => void;
  setError: (message: string) => void;
  setIsAutoplay: (next: boolean) => void;
  onTrainingTerminated: (reasonCode: SessionTerminationReasonCode) => Promise<void> | void;
  showNotice: (message: string, title?: string, autoCloseMs?: number) => void;
};

export const STEP_ACTION_ROUNDTRIP_SPAN = 'trainer-action-step-roundtrip';
export const ORDER_ACTION_ROUNDTRIP_SPAN = 'trainer-action-order-roundtrip';
