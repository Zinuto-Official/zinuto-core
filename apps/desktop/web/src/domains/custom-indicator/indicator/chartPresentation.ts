// SPDX-License-Identifier: GPL-3.0-only

import type {
  IndicatorCreateTooltipDataSourceParams,
  IndicatorFigure,
  IndicatorTooltipData,
} from 'klinecharts';
import { applyPlotDirectives } from '@/workspaces/custom-indicator/plot/semantics';
import { CUSTOM_INDICATOR_ICON_TYPE } from '@/domains/custom-indicator/indicator/iconTypes';
import type { CompiledIndicator, IndicatorOutputDefinition } from '@/domains/custom-indicator/indicator/types';
import type { RenderInstruction } from '@/workspaces/custom-indicator/plot/types';

type IndicatorResultRow = Record<string, number | null>;

const HIDDEN_COORDINATE = -1_000_000;
const RENDER_RANGE_MIN_KEY = '__ZINUTO_RENDER_RANGE_MIN__';
const RENDER_RANGE_MAX_KEY = '__ZINUTO_RENDER_RANGE_MAX__';
const TEXT_FIGURE_SIZE_PX = 12;
const TEXT_FIGURE_WEIGHT = '600';
const ICON_HALF_WIDTH_PX = 6;
const ICON_HALF_HEIGHT_PX = 7;
const ICON_BASE_OFFSET_PX = 5;
const TOOLTIP_DECIMAL_PLACES = 3;

const isFiniteNumericValue = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toFiniteNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const appendRangeValue = (
  rows: IndicatorResultRow[],
  index: number,
  value: unknown,
) => {
  if (index < 0 || index >= rows.length || !isFiniteNumericValue(value)) {
    return;
  }
  const row = rows[index];
  const currentMin = row[RENDER_RANGE_MIN_KEY];
  const currentMax = row[RENDER_RANGE_MAX_KEY];
  row[RENDER_RANGE_MIN_KEY] =
    isFiniteNumericValue(currentMin) ? Math.min(currentMin, value) : value;
  row[RENDER_RANGE_MAX_KEY] =
    isFiniteNumericValue(currentMax) ? Math.max(currentMax, value) : value;
};

const appendRangeSpan = (
  rows: IndicatorResultRow[],
  startIndex: number,
  startValue: unknown,
  endIndex: number,
  endValue: unknown,
) => {
  if (!isFiniteNumericValue(startValue) || !isFiniteNumericValue(endValue)) {
    return;
  }
  const from = Math.max(0, Math.min(startIndex, endIndex));
  const to = Math.min(rows.length - 1, Math.max(startIndex, endIndex));
  if (from > to) {
    return;
  }
  const span = endIndex - startIndex;
  for (let index = from; index <= to; index += 1) {
    const value =
      span === 0 ? startValue : startValue + ((endValue - startValue) * (index - startIndex)) / span;
    appendRangeValue(rows, index, value);
  }
};

const resolveSegmentExtendMode = (
  value: number,
): { left: boolean; right: boolean } => {
  switch (Math.round(value)) {
    case 1:
      return { left: false, right: true };
    case 2:
      return { left: true, right: false };
    case 3:
      return { left: true, right: true };
    default:
      return { left: false, right: false };
  }
};

const resolveSlopeDirection = (
  value: number,
): { left: boolean; right: boolean } => {
  switch (Math.round(value)) {
    case 1:
      return { left: true, right: false };
    case 2:
      return { left: true, right: true };
    default:
      return { left: false, right: true };
  }
};

export const buildCompiledIndicatorRenderRangeFigures = (): Array<IndicatorFigure<IndicatorResultRow>> => [
  { key: RENDER_RANGE_MIN_KEY },
  { key: RENDER_RANGE_MAX_KEY },
];

export const appendRenderInstructionRangeRows = (
  rows: IndicatorResultRow[],
  renderInstructions: readonly RenderInstruction[],
): IndicatorResultRow[] => {
  if (!rows.length || !renderInstructions.length) {
    return rows;
  }

  renderInstructions.forEach((instruction) => {
    switch (instruction.primitive) {
      case 'line':
        instruction.series.forEach((value, index) => {
          if (instruction.visibleMask[index]) {
            appendRangeValue(rows, index, value);
          }
        });
        break;
      case 'histogram':
        instruction.upperSeries.forEach((value, index) => {
          if (instruction.visibleMask[index]) {
            appendRangeValue(rows, index, value);
            appendRangeValue(rows, index, instruction.lowerSeries[index]);
          }
        });
        break;
      case 'iconMarker':
        instruction.anchorSeries.forEach((value, index) => {
          if (instruction.visibleMask[index]) {
            appendRangeValue(rows, index, value);
          }
        });
        break;
      case 'textMarker':
        instruction.anchorSeries.forEach((value, index) => {
          if (instruction.visibleMask[index]) {
            appendRangeValue(rows, index, value);
          }
        });
        break;
      case 'numberMarker':
        instruction.anchorSeries.forEach((value, index) => {
          if (instruction.visibleMask[index]) {
            appendRangeValue(rows, index, value);
            appendRangeValue(rows, index, instruction.numberSeries[index]);
          }
        });
        break;
      case 'segment': {
        let searchStart = 0;
        for (let index = 0; index < instruction.startMask.length; index += 1) {
          const startValue = instruction.startSeries[index];
          if (!instruction.startMask[index] || !isFiniteNumericValue(startValue)) {
            continue;
          }
          let endIndex = Math.max(searchStart, index);
          while (
            endIndex < instruction.endMask.length &&
            (!instruction.endMask[endIndex] || !isFiniteNumericValue(instruction.endSeries[endIndex]))
          ) {
            endIndex += 1;
          }
          if (endIndex >= instruction.endMask.length) {
            break;
          }
          searchStart = endIndex + 1;
          const endValue = instruction.endSeries[endIndex];
          if (!isFiniteNumericValue(endValue)) {
            continue;
          }
          const deltaIndex = Math.max(1, endIndex - index);
          const slope = (endValue - startValue) / deltaIndex;
          const extendMode = resolveSegmentExtendMode(instruction.extend);
          const rangeStartIndex = extendMode.left ? 0 : index;
          const rangeEndIndex = extendMode.right ? rows.length - 1 : endIndex;
          const rangeStartValue = extendMode.left
            ? startValue - slope * index
            : startValue;
          const rangeEndValue = extendMode.right
            ? startValue + slope * (rangeEndIndex - index)
            : endValue;
          appendRangeSpan(
            rows,
            rangeStartIndex,
            rangeStartValue,
            rangeEndIndex,
            rangeEndValue,
          );
        }
        break;
      }
      case 'slopeSegment':
        instruction.anchorSeries.forEach((anchorValue, index) => {
          if (!instruction.anchorMask[index] || !isFiniteNumericValue(anchorValue)) {
            return;
          }
          const slopeValue = isFiniteNumericValue(instruction.slopeSeries[index])
            ? instruction.slopeSeries[index]
            : 0;
          const lengthBars = Math.max(1, Math.floor(Math.abs(instruction.lengthSeries[index] ?? 0)));
          const direction = resolveSlopeDirection(instruction.directSeries[index] ?? 0);
          const startIndex = direction.left ? Math.max(0, index - lengthBars) : index;
          const endIndex = direction.right ? Math.min(rows.length - 1, index + lengthBars) : index;
          const startValue = direction.left
            ? anchorValue - slopeValue * (index - startIndex)
            : anchorValue;
          const endValue = direction.right
            ? anchorValue + slopeValue * (endIndex - index)
            : anchorValue;
          appendRangeSpan(rows, startIndex, startValue, endIndex, endValue);
        });
        break;
      case 'ohlc':
        instruction.openSeries.forEach((value, index) => {
          if (instruction.visibleMask[index]) {
            appendRangeValue(rows, index, value);
            appendRangeValue(rows, index, instruction.highSeries[index]);
            appendRangeValue(rows, index, instruction.lowSeries[index]);
            appendRangeValue(rows, index, instruction.closeSeries[index]);
          }
        });
        break;
      case 'band':
        instruction.upperSeries.forEach((value, index) => {
          if (instruction.visibleMask[index]) {
            appendRangeValue(rows, index, value);
            appendRangeValue(rows, index, instruction.lowerSeries[index]);
          }
        });
        break;
      default:
        break;
    }
  });

  return rows;
};

const formatTooltipNumericValue = (value: number): string => {
  const normalized = Math.abs(value) < 0.5 / 10 ** TOOLTIP_DECIMAL_PLACES
    ? 0
    : value;
  return normalized.toFixed(TOOLTIP_DECIMAL_PLACES);
};

const resolveFigureTitle = (
  output: IndicatorOutputDefinition,
): string | undefined => {
  const title = String(output.title ?? '').trim();
  return title ? `${title}: ` : undefined;
};

const resolveTooltipDataIndex = (
  params: IndicatorCreateTooltipDataSourceParams<IndicatorResultRow>,
): number => {
  const result = Array.isArray(params.indicator?.result)
    ? params.indicator.result
    : [];
  const rawDataIndex = Number(params.crosshair?.dataIndex);
  if (Number.isFinite(rawDataIndex) && rawDataIndex >= 0) {
    const dataIndex = Math.floor(rawDataIndex);
    return Math.min(result.length - 1, dataIndex);
  }
  return result.length - 1;
};

const buildLineFigureStyle = (
  output: IndicatorOutputDefinition,
): (() => Record<string, unknown>) => {
  const semantics = applyPlotDirectives(output.directives ?? [], output.style);
  const lineType = semantics.lineStyle === 'dot' ? 'dashed' : 'solid';

  return () => ({
    color: semantics.color,
    size: Math.max(1, semantics.lineWidth),
    style: lineType,
    dashedValue: lineType === 'dashed' ? [4, 4] : [0, 0],
    borderColor: semantics.color,
    borderSize: 0,
    backgroundColor: 'transparent',
  });
};

const buildTextFigureStyle = (
  output: IndicatorOutputDefinition,
): (() => Record<string, unknown>) => {
  const semantics = applyPlotDirectives(output.directives ?? [], output.style);
  return () => ({
    style: 'fill',
    color: semantics.color,
    size: TEXT_FIGURE_SIZE_PX,
    weight: TEXT_FIGURE_WEIGHT,
    borderStyle: 'solid',
    borderDashedValue: [0, 0],
    borderSize: 0,
    borderColor: semantics.color,
    borderRadius: 0,
    backgroundColor: 'transparent',
  });
};

const buildIconFigureStyle = (
  output: IndicatorOutputDefinition,
): (() => Record<string, unknown>) => {
  const semantics = applyPlotDirectives(output.directives ?? [], output.style);
  const borderStyle = semantics.lineStyle === 'dot' ? 'dashed' : 'solid';
  return () => ({
    style: 'fill',
    color: semantics.color,
    borderColor: semantics.color,
    borderSize: 0,
    borderStyle,
    borderDashedValue: borderStyle === 'dashed' ? [4, 4] : [0, 0],
  });
};

const buildHiddenPolygonCoords = () => [
  { x: HIDDEN_COORDINATE, y: HIDDEN_COORDINATE },
  { x: HIDDEN_COORDINATE, y: HIDDEN_COORDINATE },
  { x: HIDDEN_COORDINATE, y: HIDDEN_COORDINATE },
];

const buildIconPolygonCoords = (
  x: number,
  y: number,
  iconType: number,
): Array<{ x: number; y: number }> => {
  if (iconType === CUSTOM_INDICATOR_ICON_TYPE.SELL) {
    return [
      { x, y: y + ICON_HALF_HEIGHT_PX },
      { x: x - ICON_HALF_WIDTH_PX, y: y - ICON_BASE_OFFSET_PX },
      { x: x + ICON_HALF_WIDTH_PX, y: y - ICON_BASE_OFFSET_PX },
    ];
  }

  return [
    { x, y: y - ICON_HALF_HEIGHT_PX },
    { x: x - ICON_HALF_WIDTH_PX, y: y + ICON_BASE_OFFSET_PX },
    { x: x + ICON_HALF_WIDTH_PX, y: y + ICON_BASE_OFFSET_PX },
  ];
};

const resolveIndicatorIconType = (
  output: IndicatorOutputDefinition,
): number => {
  const numeric = Number(output.iconType);
  if (Number.isFinite(numeric)) {
    return Math.floor(numeric);
  }
  return CUSTOM_INDICATOR_ICON_TYPE.BUY;
};

export const buildCompiledIndicatorTooltipDataSource = (
  compiled: CompiledIndicator,
) => {
  const visibleOutputs = compiled.definition.outputs.filter((output) => {
    const title = String(output.title ?? '').trim();
    return title.length > 0;
  });

  return (
    params: IndicatorCreateTooltipDataSourceParams<IndicatorResultRow>,
  ): IndicatorTooltipData => {
    const result = Array.isArray(params.indicator?.result)
      ? params.indicator.result
      : [];
    const dataIndex = resolveTooltipDataIndex(params);
    const current =
      dataIndex >= 0 && dataIndex < result.length ? result[dataIndex] ?? {} : {};
    const calcParams = Array.isArray(params.indicator?.calcParams)
      ? params.indicator.calcParams
      : [];

    return {
      name: String(params.indicator?.shortName ?? params.indicator?.name ?? ''),
      calcParamsText: calcParams.length > 0 ? `(${calcParams.join(',')})` : '',
      features: [],
      legends: visibleOutputs.flatMap((output) => {
        const semantics = applyPlotDirectives(output.directives ?? [], output.style);
        const rawValue = current?.[output.key];
        if (!isFiniteNumericValue(rawValue)) {
          return [];
        }
        return {
          title: {
            text: `${output.title}: `,
            color: semantics.color,
          },
          value: {
            text: formatTooltipNumericValue(rawValue),
            color: semantics.color,
          },
        };
      }),
    };
  };
};

export const buildCompiledIndicatorFigure = (
  output: IndicatorOutputDefinition,
): IndicatorFigure<IndicatorResultRow> | null => {
  const key = output.key;
  const title = resolveFigureTitle(output);
  const primitive = output.renderPrimitive ?? 'line';

  if (
    primitive === 'histogram' ||
    primitive === 'segment' ||
    primitive === 'slopeSegment' ||
    primitive === 'ohlc' ||
    primitive === 'band'
  ) {
    return null;
  }

  if (primitive === 'iconMarker') {
    const iconType = resolveIndicatorIconType(output);
    return {
      key,
      title,
      type: 'polygon',
      styles: buildIconFigureStyle(output),
      attrs: ({ coordinate }) => {
        const x = toFiniteNumber(coordinate?.current?.x);
        const y = toFiniteNumber(coordinate?.current?.[key]);
        if (x === null || y === null) {
          return {
            coordinates: buildHiddenPolygonCoords(),
          };
        }
        return {
          coordinates: buildIconPolygonCoords(x, y, iconType),
        };
      },
    };
  }

  if (primitive === 'textMarker') {
    const text = String(output.plotText || output.title || output.key || '').trim();
    return {
      key,
      title,
      type: 'text',
      styles: buildTextFigureStyle(output),
      attrs: ({ coordinate }) => {
        const x = toFiniteNumber(coordinate?.current?.x);
        const y = toFiniteNumber(coordinate?.current?.[key]);
        if (x === null || y === null) {
          return {
            x: HIDDEN_COORDINATE,
            y: HIDDEN_COORDINATE,
            text: '',
            align: 'center',
            baseline: 'middle',
          };
        }
        return {
          x,
          y,
          text,
          align: 'center',
          baseline: 'middle',
        };
      },
    };
  }

  if (primitive === 'numberMarker') {
    return {
      key,
      title,
      type: 'text',
      styles: buildTextFigureStyle(output),
      attrs: ({ coordinate, data }) => {
        const x = toFiniteNumber(coordinate?.current?.x);
        const y = toFiniteNumber(coordinate?.current?.[key]);
        const text = data?.current?.[key];
        if (x === null || y === null || !isFiniteNumericValue(text)) {
          return {
            x: HIDDEN_COORDINATE,
            y: HIDDEN_COORDINATE,
            text: '',
            align: 'center',
            baseline: 'middle',
          };
        }
        return {
          x,
          y,
          text: String(text),
          align: 'center',
          baseline: 'middle',
        };
      },
    };
  }

  return {
    key,
    title,
    type: 'line',
    styles: buildLineFigureStyle(output),
  };
};
