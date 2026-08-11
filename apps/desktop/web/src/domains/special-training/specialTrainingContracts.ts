// SPDX-License-Identifier: GPL-3.0-only

import type { SpecialTrainingReplayOverlayContext } from "@/domains/chart/overlays/specialTrainingReplayOverlayTypes";
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import type { OrderInputMode as TradeInputMode } from "@zinuto/shared/trading";
import type { ReplayContextSummaryChip } from "@/frontend-kernel/replayContext";
import type { Dispatch, SetStateAction } from 'react';
import type { Bar } from '@/domains/training/types';

export type SpecialTrainingShortcutBindings = {
  stepNext: () => Promise<void>;
  undo: () => Promise<void>;
  placeOrder: (side: 'BUY' | 'SELL') => Promise<void>;
  toggleAutoplay: () => Promise<void>;
  createTrainingRecordReplayNote: () => void;
  buyTradeInputMode: TradeInputMode;
  buyRatioPresetOptions: ReadonlyArray<string>;
  setBuyRatioInput: Dispatch<SetStateAction<string>>;
};

export type SpecialTrainingResumableSessionModeId =
  | 'fast-decision-training'
  | 'risk-discipline-training';

export type SpecialTrainingResumableSessionState = {
  challengeId: string;
  modeId: SpecialTrainingResumableSessionModeId;
  currentQuestionId: string;
  currentQuestionIndex: number;
  questionCount: number;
  paused: boolean;
};

export type SpecialTrainingLaunchRequest = {
  requestId: number;
  modeId: SpecialTrainingResumableSessionModeId;
};

export type SpecialTrainingChartSyncState = {
  questionId: string;
  symbol: string;
  baseTimeframe?: BaseTimeframe | null;
  bars: Bar[];
  cursorIndex: number;
  windowStartIndex: number;
  decisionBoundaryRawIndex: number;
  decisionMarker: SpecialTrainingReplayOverlayContext['decisionMarker'];
  tradeMarkers: Array<{
    rawIndex: number;
    side: 'BUY' | 'SELL';
    price: number;
    label: string;
  }>;
  fastDecisionExtremeRay: SpecialTrainingReplayOverlayContext['fastDecisionExtremeRay'];
  riskDisciplineGuides: SpecialTrainingReplayOverlayContext['riskDisciplineGuides'];
};

export type SpecialTrainingChartSyncHandler = (
  payload: SpecialTrainingChartSyncState | null,
) => void;

export type SpecialTrainingChallengeReviewNoteRequest = {
  questionId: string;
  modeId: string;
  summaryChips: ReplayContextSummaryChip[];
  initialCapital: number;
  finalTotalAsset: number | null;
  maxDrawdownRatio: number;
  position: {
    qty: number;
    avgCost: number;
    markPrice: number;
  } | null;
  contextOverride?: {
    symbol: string;
    bars: Bar[];
    cursorIndex: number;
    tradeMarkers?: Array<{
      rawIndex: number;
      side: 'BUY' | 'SELL';
      price: number;
      label?: string;
    }>;
    baseTimeframe?: BaseTimeframe | null;
    specialTraining?: SpecialTrainingReplayOverlayContext | null;
  } | null;
};
