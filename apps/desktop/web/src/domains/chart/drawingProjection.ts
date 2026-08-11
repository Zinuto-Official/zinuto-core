// SPDX-License-Identifier: GPL-3.0-only

import type { SavedDrawingOverlay } from "@/domains/chart/drawingTypes";
import type { DisplayPeriodKey } from "@/domains/chart/chartPeriods";
import { isDisplayPeriodKey } from '@/ui/config/uiConfig';
import { getPeriodStartMs } from '@/domains/chart/replayAggregation';

export type ProjectedDrawingPoint = {
  timestamp: number;
  value?: number;
  dataIndex?: number;
};

type DrawingProjectionVisibleBar = {
  bucketStartMs: number;
};

const toFiniteTimestamp = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const buildVisibleIndexByTimestamp = (
  visibleBars: readonly DrawingProjectionVisibleBar[],
): Map<number, number> => {
  const indexByTimestamp = new Map<number, number>();
  for (let index = 0; index < visibleBars.length; index += 1) {
    const timestamp = toFiniteTimestamp(visibleBars[index]?.bucketStartMs);
    if (timestamp !== null) {
      indexByTimestamp.set(timestamp, index);
    }
  }
  return indexByTimestamp;
};

const preserveProjectedPointSpan = (
  points: ProjectedDrawingPoint[],
  visibleBars: readonly DrawingProjectionVisibleBar[],
): ProjectedDrawingPoint[] => {
  if (points.length < 2 || visibleBars.length < 2) {
    return points;
  }

  const indexByTimestamp = buildVisibleIndexByTimestamp(visibleBars);
  const pointIndexesByTimestamp = new Map<number, number[]>();
  points.forEach((point, index) => {
    const existing = pointIndexesByTimestamp.get(point.timestamp);
    if (existing) {
      existing.push(index);
      return;
    }
    pointIndexesByTimestamp.set(point.timestamp, [index]);
  });

  const nextPoints = [...points];
  pointIndexesByTimestamp.forEach((pointIndexes, timestamp) => {
    if (pointIndexes.length < 2 || pointIndexes.length > visibleBars.length) {
      return;
    }
    const preferredIndex = indexByTimestamp.get(timestamp);
    if (typeof preferredIndex !== 'number') {
      return;
    }
    const startIndex = Math.min(
      Math.max(0, preferredIndex),
      Math.max(0, visibleBars.length - pointIndexes.length),
    );
    pointIndexes.forEach((pointIndex, offset) => {
      const visibleBar = visibleBars[startIndex + offset];
      const projectedTimestamp = toFiniteTimestamp(visibleBar?.bucketStartMs);
      if (projectedTimestamp === null) {
        return;
      }
      nextPoints[pointIndex] = {
        ...nextPoints[pointIndex],
        timestamp: projectedTimestamp,
        dataIndex: startIndex + offset,
      };
    });
  });

  return nextPoints;
};

export const isSourcePeriodOnlyDrawing = (name: string): boolean => name === 'simpleAnnotation';

export const shouldRenderDrawingInDisplayPeriod = (
  item: Pick<SavedDrawingOverlay, 'name' | 'sourcePeriod'>,
  period: DisplayPeriodKey,
): boolean => {
  const sourcePeriod = isDisplayPeriodKey(item.sourcePeriod) ? item.sourcePeriod : period;
  if (sourcePeriod === period) {
    return true;
  }
  return !isSourcePeriodOnlyDrawing(item.name);
};

export const projectDrawingPointsForPeriodCore = ({
  item,
  period,
  visibleBars,
  timeZone,
}: {
  item: SavedDrawingOverlay;
  period: DisplayPeriodKey;
  visibleBars: readonly DrawingProjectionVisibleBar[];
  timeZone?: string | null;
}): ProjectedDrawingPoint[] => {
  if (!Array.isArray(item.points) || !item.points.length) {
    return [];
  }

  const sourcePeriod = item.sourcePeriod ?? period;
  const needsTimestampProjection = sourcePeriod !== period;
  const indexByTimestamp = buildVisibleIndexByTimestamp(visibleBars);
  const projectedPoints = item.points
    .map((rawPoint) => {
      let timestamp = toFiniteTimestamp(rawPoint?.timestamp);
      if (timestamp === null && !needsTimestampProjection) {
        const dataIndex = Number(rawPoint?.dataIndex);
        if (Number.isFinite(dataIndex)) {
          const sourceVisible = visibleBars[Math.max(0, Math.floor(dataIndex))];
          timestamp = toFiniteTimestamp(sourceVisible?.bucketStartMs);
        }
      }
      if (timestamp === null) {
        return null;
      }
      const projectedTimestamp = needsTimestampProjection
        ? getPeriodStartMs(timestamp, period, timeZone ?? undefined)
        : timestamp;
      const nextPoint: ProjectedDrawingPoint = { timestamp: projectedTimestamp };
      const value = Number(rawPoint?.value);
      if (Number.isFinite(value)) {
        nextPoint.value = value;
      }
      const matchedIndex = indexByTimestamp.get(projectedTimestamp);
      if (typeof matchedIndex === 'number') {
        nextPoint.dataIndex = matchedIndex;
      }
      return nextPoint;
    })
    .filter((point): point is ProjectedDrawingPoint => Boolean(point));

  return preserveProjectedPointSpan(projectedPoints, visibleBars);
};
