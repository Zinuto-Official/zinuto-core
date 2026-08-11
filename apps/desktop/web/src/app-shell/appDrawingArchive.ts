// SPDX-License-Identifier: GPL-3.0-only

import type { SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import { type OverlayMode } from 'klinecharts';
import { isDisplayPeriodKey } from '@/ui/config/uiConfig';
import {
  getDrawingMinPointCount,
  isDrawingOverlayInProgress
} from '@/domains/chart/drawingOverlayLifecycle';
import { MAX_ARCHIVE_TEXT_CHARS } from '@/frontend-kernel/runtimeConstants';

export const sanitizeDrawingForArchive = (raw: unknown): SavedDrawingOverlay | null => {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const name = typeof item.name === 'string' ? item.name : '';
  if (!name) {
    return null;
  }
  if (isDrawingOverlayInProgress(item)) {
    return null;
  }

  const minPointCount = getDrawingMinPointCount(name);

  const points = Array.isArray(item.points)
    ? item.points
        .map((point) => {
          if (!point || typeof point !== 'object') {
            return null;
          }
          const source = point as Record<string, unknown>;
          const timestamp = Number(source.timestamp);
          if (!Number.isFinite(timestamp)) {
            return null;
          }
          const value = Number(source.value);
          const dataIndex = Number(source.dataIndex);
          const next: { timestamp: number; value?: number; dataIndex?: number } = { timestamp };
          if (Number.isFinite(value)) {
            next.value = value;
          }
          if (Number.isFinite(dataIndex)) {
            next.dataIndex = dataIndex;
          }
          return next;
        })
        .filter((point): point is { timestamp: number; value?: number; dataIndex?: number } => Boolean(point))
    : [];

  if (points.length < minPointCount) {
    return null;
  }

  const next: SavedDrawingOverlay = { name, points };
  if (typeof item.id === 'string' && item.id) next.id = item.id;
  if (typeof item.visible === 'boolean') next.visible = item.visible;
  if (typeof item.lock === 'boolean') next.lock = item.lock;
  if (Number.isFinite(Number(item.zLevel))) next.zLevel = Number(item.zLevel);
  if (typeof item.mode === 'string') next.mode = item.mode as OverlayMode;
  if (Number.isFinite(Number(item.modeSensitivity))) next.modeSensitivity = Number(item.modeSensitivity);
  if (typeof item.needDefaultXAxisFigure === 'boolean') next.needDefaultXAxisFigure = item.needDefaultXAxisFigure;
  if (item.styles && typeof item.styles === 'object') next.styles = item.styles;
  if (item.extendData !== undefined) {
    if (name === 'simpleAnnotation' && item.extendData && typeof item.extendData === 'object') {
      const extendData = { ...(item.extendData as Record<string, unknown>) };
      const rawText = typeof extendData.text === 'string' ? extendData.text : '';
      if (rawText) {
        extendData.text = rawText.slice(0, MAX_ARCHIVE_TEXT_CHARS);
      }
      next.extendData = extendData;
    } else {
      next.extendData = item.extendData;
    }
  }
  if (isDisplayPeriodKey(item.sourcePeriod)) next.sourcePeriod = item.sourcePeriod;
  return next;
};
