// SPDX-License-Identifier: GPL-3.0-only

export const OVERLAY_IGNORED_EVENTS = [
  'onDoubleClick',
  'onRightClick',
  'onPressedMoveStart',
  'onPressedMoving',
  'onPressedMoveEnd',
  'onSelected',
  'onDeselected'
] as const;

export const TRADE_MARKER_LAYOUT = {
  headSizePx: 7,
  stemLenPx: 15,
  headHalfWidth: 4.8,
  labelGapPx: 8,
  lineGapPx: 13,
  minPadding: 4
};
