// SPDX-License-Identifier: GPL-3.0-only

export type MarginSafetyZone = "SAFE" | "CROWDED" | "DANGER" | "BREACH";

export type MarginSafetyPoint = {
  sessionId: string;
  sequenceIndex: number;
  sequenceText: string;
  symbol: string;
  minBufferRate: number;
  peakPressureRate: number;
  zone: MarginSafetyZone;
  isRepresentative: boolean;
};

export type MarginSafetyZoneSummary = {
  zone: MarginSafetyZone;
  count: number;
  share: number;
};

export type MarginSafetyFocusWindow = {
  isDense: boolean;
  startIndex: number;
  endIndex: number;
  startPercent: number;
  endPercent: number;
};

export type MarginSafetyViewModel = {
  dangerSessionShare: number;
  dangerSessionCount: number;
  minSafetyBufferRate: number;
  breachSessionCount: number;
  sessionSafetyPoints: MarginSafetyPoint[];
  zoneSummaries: MarginSafetyZoneSummary[];
  worstSessionPoints: MarginSafetyPoint[];
  focusWindow: MarginSafetyFocusWindow;
};

export const MARGIN_BUFFER_SAFE_RATE = 0.3;
export const MARGIN_BUFFER_DANGER_RATE = 0.15;
export const MARGIN_BUFFER_BREACH_RATE = 0;

export const EMPTY_MARGIN_SAFETY_VIEW_MODEL: MarginSafetyViewModel = {
  dangerSessionShare: 0,
  dangerSessionCount: 0,
  minSafetyBufferRate: 1,
  breachSessionCount: 0,
  sessionSafetyPoints: [],
  zoneSummaries: [
    { zone: "BREACH", count: 0, share: 0 },
    { zone: "DANGER", count: 0, share: 0 },
    { zone: "CROWDED", count: 0, share: 0 },
    { zone: "SAFE", count: 0, share: 0 },
  ],
  worstSessionPoints: [],
  focusWindow: {
    isDense: false,
    startIndex: 0,
    endIndex: 0,
    startPercent: 0,
    endPercent: 100,
  },
};
