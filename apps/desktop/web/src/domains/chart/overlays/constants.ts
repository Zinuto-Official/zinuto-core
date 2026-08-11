// SPDX-License-Identifier: GPL-3.0-only

export type ChartOverlayIds = {
  drawGroupId: string;
  historyDrawGroupId: string;
  systemTradeGroup: string;
  systemNoteGroup: string;
  systemPositionOverlayId: string;
};

export const DRAW_GROUP_ID = 'user-drawing';
export const USER_DRAWING_Z_LEVEL = 1200;
export const SYSTEM_TRADE_GROUP = 'system-trade';
export const SYSTEM_POSITION_OVERLAY_ID = 'system-position-line';
export const SYSTEM_NOTE_GROUP = 'system-note';
export const SYSTEM_TRADE_MARKER_OVERLAY_NAME = 'tradeMarkerV2';
export const DIAGNOSTIC_FOCUS_OVERLAY_NAME = 'diagnosticFocusMarker';
export const SPECIAL_TRAINING_EXTREME_TAG_OVERLAY_NAME = 'specialTrainingExtremeTag';
export const SPECIAL_TRAINING_DECISION_MARK_OVERLAY_NAME = 'specialTrainingDecisionMark';
export const SPECIAL_TRAINING_DECISION_REFERENCE_OVERLAY_NAME = 'specialTrainingDecisionReferenceLine';
const HISTORY_DRAW_GROUP_ID = 'history-readonly-drawing';

export const CHART_OVERLAY_IDS: ChartOverlayIds = {
  drawGroupId: DRAW_GROUP_ID,
  historyDrawGroupId: HISTORY_DRAW_GROUP_ID,
  systemTradeGroup: SYSTEM_TRADE_GROUP,
  systemNoteGroup: SYSTEM_NOTE_GROUP,
  systemPositionOverlayId: SYSTEM_POSITION_OVERLAY_ID
};
