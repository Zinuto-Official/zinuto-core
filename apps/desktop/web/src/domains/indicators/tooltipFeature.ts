// SPDX-License-Identifier: GPL-3.0-only

import type {
  DeepPartial,
  IndicatorCreateTooltipDataSourceCallback,
  IndicatorStyle,
  IndicatorTooltipData,
  TooltipFeatureStyle,
} from "klinecharts";

import { CHART_STYLE_COLOR_TOKENS } from "@/ui/theme/visualColors";

import { normalizeIndicatorCalcParams } from "@/domains/indicators/core";

const CHART_SETTINGS_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX =
  "chart-settings-indicator:";
const CHART_SETTINGS_INDICATOR_TOOLTIP_LABEL_FEATURE_ID_PREFIX =
  "chart-settings-indicator-label:";
const INDICATOR_TOOLTIP_NAME_FONT_FAMILY = "system-ui";
const INDICATOR_TOOLTIP_NAME_FONT_SIZE_PX = 12;
const INDICATOR_TOOLTIP_GEAR_ICON = "\u2699";
const CHART_SETTINGS_TOOLTIP_DATA_SOURCE_WRAPPED_FLAG =
  "__zinutoChartSettingsTooltipWrapped";
const CHART_SETTINGS_TOOLTIP_DATA_SOURCE_BASE_KEY =
  "__zinutoChartSettingsTooltipBase";

export const buildChartSettingsIndicatorTooltipFeatureId = (
  indicatorId: string,
): string =>
  `${CHART_SETTINGS_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX}${String(
    indicatorId || "",
  ).trim()}`;

const buildChartSettingsIndicatorTooltipLabelFeatureId = (
  indicatorId: string,
): string =>
  `${CHART_SETTINGS_INDICATOR_TOOLTIP_LABEL_FEATURE_ID_PREFIX}${String(
    indicatorId || "",
  ).trim()}`;

export const resolveChartSettingsIndicatorTooltipLabelTarget = (
  featureId: unknown,
): string | null => {
  const normalizedFeatureId = String(featureId ?? "").trim();
  if (
    !normalizedFeatureId.startsWith(
      CHART_SETTINGS_INDICATOR_TOOLTIP_LABEL_FEATURE_ID_PREFIX,
    )
  ) {
    return null;
  }
  const target = normalizedFeatureId.slice(
    CHART_SETTINGS_INDICATOR_TOOLTIP_LABEL_FEATURE_ID_PREFIX.length,
  );
  return target || null;
};

export const resolveChartSettingsIndicatorTooltipTarget = (
  featureId: unknown,
): string | null => {
  const normalizedFeatureId = String(featureId ?? "").trim();
  if (
    !normalizedFeatureId.startsWith(
      CHART_SETTINGS_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX,
    )
  ) {
    return null;
  }
  const target = normalizedFeatureId.slice(
    CHART_SETTINGS_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX.length,
  );
  return target || null;
};

export const formatChartSettingsIndicatorTooltipLabel = (
  shortName: unknown,
  calcParams: unknown,
): string => {
  const normalizedName = String(shortName ?? "").trim();
  if (!normalizedName) {
    return "";
  }
  const normalizedParams = normalizeIndicatorCalcParams(calcParams);
  if (!normalizedParams.length) {
    return normalizedName;
  }
  return `${normalizedName}(${normalizedParams.join(",")})`;
};

const formatChartSettingsIndicatorTooltipParamsText = (
  calcParams: unknown,
): string => {
  const normalizedParams = normalizeIndicatorCalcParams(calcParams);
  if (!normalizedParams.length) {
    return "";
  }
  return `(${normalizedParams.join(",")})`;
};

type CreateChartSettingsIndicatorTooltipFeatureArgs = {
  featureId: string;
  label: string;
  position: "left" | "right";
  color: string;
  activeColor: string;
  backgroundColor: string;
  marginLeft?: number;
  marginRight?: number;
};

const createChartSettingsIndicatorTooltipFeature = ({
  featureId,
  label,
  position,
  color,
  activeColor,
  backgroundColor,
  marginLeft = 0,
  marginRight = 0,
}: CreateChartSettingsIndicatorTooltipFeatureArgs): TooltipFeatureStyle => ({
  id: featureId,
  position,
  marginLeft,
  marginTop: 0,
  marginRight,
  marginBottom: 0,
  paddingLeft: 0,
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  backgroundColor,
  activeBackgroundColor: backgroundColor,
  size: INDICATOR_TOOLTIP_NAME_FONT_SIZE_PX,
  color,
  activeColor,
  borderRadius: 0,
  type: "icon_font",
  content: {
    family: INDICATOR_TOOLTIP_NAME_FONT_FAMILY,
    code: String(label || "").trim(),
  },
});

const createInteractiveChartSettingsIndicatorTooltipFeatures = (input: {
  featureId: string;
  shortName: unknown;
  calcParams: unknown;
  color: string;
  activeColor: string;
  labelActiveColor: string;
  backgroundColor: string;
}) => {
  const indicatorId =
    resolveChartSettingsIndicatorTooltipTarget(input.featureId) ?? "";
  const normalizedName = String(input.shortName ?? "").trim();
  const paramsText = formatChartSettingsIndicatorTooltipParamsText(
    input.calcParams,
  );
  if (!normalizedName) {
    return [];
  }

  const features = [
    createChartSettingsIndicatorTooltipFeature({
      featureId: buildChartSettingsIndicatorTooltipLabelFeatureId(indicatorId),
      label: normalizedName,
      position: "left",
      color: input.color,
      activeColor: input.labelActiveColor,
      backgroundColor: input.backgroundColor,
      marginRight: 2,
    }),
  ];

  if (!paramsText) {
    return features;
  }

  features.push(
    createChartSettingsIndicatorTooltipFeature({
      featureId: input.featureId,
      label: paramsText,
      position: "left",
      color: input.color,
      activeColor: input.activeColor,
      backgroundColor: input.backgroundColor,
      marginRight: 2,
    }),
    createChartSettingsIndicatorTooltipFeature({
      featureId: input.featureId,
      label: INDICATOR_TOOLTIP_GEAR_ICON,
      position: "left",
      color: input.color,
      activeColor: input.activeColor,
      backgroundColor: input.backgroundColor,
      marginRight: 6,
    }),
  );

  return features;
};

type WrappedChartSettingsIndicatorTooltipDataSource =
  IndicatorCreateTooltipDataSourceCallback<unknown> & {
    [CHART_SETTINGS_TOOLTIP_DATA_SOURCE_WRAPPED_FLAG]?: boolean;
    [CHART_SETTINGS_TOOLTIP_DATA_SOURCE_BASE_KEY]?:
      | IndicatorCreateTooltipDataSourceCallback<unknown>
      | null;
  };

const isWrappedChartSettingsIndicatorTooltipDataSource = (
  value: unknown,
): value is WrappedChartSettingsIndicatorTooltipDataSource =>
  typeof value === "function" &&
  Boolean(
    (value as WrappedChartSettingsIndicatorTooltipDataSource)[
      CHART_SETTINGS_TOOLTIP_DATA_SOURCE_WRAPPED_FLAG
    ],
  );

export const unwrapChartSettingsIndicatorTooltipDataSource = (
  value: IndicatorCreateTooltipDataSourceCallback<unknown> | null | undefined,
): IndicatorCreateTooltipDataSourceCallback<unknown> | null => {
  if (!value) {
    return null;
  }
  if (!isWrappedChartSettingsIndicatorTooltipDataSource(value)) {
    return value;
  }
  return (
    value[CHART_SETTINGS_TOOLTIP_DATA_SOURCE_BASE_KEY] ?? null
  );
};

type CreateChartSettingsIndicatorTooltipDataSourceArgs = {
  indicatorId: string;
  color: string;
  activeColor?: string;
  labelActiveColor?: string;
  backgroundColor?: string;
  baseDataSource?: IndicatorCreateTooltipDataSourceCallback<unknown> | null;
};

export const createChartSettingsIndicatorTooltipDataSource = ({
  indicatorId,
  color,
  activeColor,
  labelActiveColor,
  backgroundColor = CHART_STYLE_COLOR_TOKENS.curve.transparent,
  baseDataSource = null,
}: CreateChartSettingsIndicatorTooltipDataSourceArgs): IndicatorCreateTooltipDataSourceCallback<unknown> => {
  const wrapped = ((params) => {
    const baseData = baseDataSource?.(params);
    const featureId = buildChartSettingsIndicatorTooltipFeatureId(indicatorId);
    const baseFeatures = Array.isArray(baseData?.features)
      ? baseData.features
      : [];
    const features = createInteractiveChartSettingsIndicatorTooltipFeatures({
      featureId,
      shortName:
        params.indicator?.shortName ?? baseData?.name ?? params.indicator?.name,
      calcParams: params.indicator?.calcParams,
      color,
      activeColor: activeColor ?? color,
      labelActiveColor: labelActiveColor ?? activeColor ?? color,
      backgroundColor,
    });
    const resolvedFeatures = features.length
      ? [
          ...features,
          ...baseFeatures,
        ]
      : baseFeatures;

    return {
      name: "",
      calcParamsText: "",
      legends: (baseData?.legends ??
        undefined) as unknown as IndicatorTooltipData["legends"],
      features: resolvedFeatures,
    } as IndicatorTooltipData;
  }) as WrappedChartSettingsIndicatorTooltipDataSource;

  wrapped[CHART_SETTINGS_TOOLTIP_DATA_SOURCE_WRAPPED_FLAG] = true;
  wrapped[CHART_SETTINGS_TOOLTIP_DATA_SOURCE_BASE_KEY] = baseDataSource;
  return wrapped;
};

type BuildChartSettingsIndicatorTooltipStylesArgs = {
  interactive: boolean;
  indicatorId: string;
  shortName: string;
  calcParams: unknown;
  color: string;
  activeColor?: string;
  labelActiveColor?: string;
  backgroundColor?: string;
};

export const buildChartSettingsIndicatorTooltipStyles = ({
  interactive,
  indicatorId,
  shortName,
  calcParams,
  color,
  activeColor,
  labelActiveColor,
  backgroundColor = CHART_STYLE_COLOR_TOKENS.curve.transparent,
}: BuildChartSettingsIndicatorTooltipStylesArgs): DeepPartial<IndicatorStyle> => {
  if (!interactive) {
    return {
      tooltip: {
        title: {
          show: true,
          showName: true,
          showParams: true,
        },
        features: [],
      },
    };
  }

  const featureId = buildChartSettingsIndicatorTooltipFeatureId(indicatorId);
  const features = createInteractiveChartSettingsIndicatorTooltipFeatures({
    featureId,
    shortName,
    calcParams,
    color,
    activeColor: activeColor ?? color,
    labelActiveColor: labelActiveColor ?? activeColor ?? color,
    backgroundColor,
  });
  if (!features.length) {
    return {
      tooltip: {
        title: {
          show: true,
          showName: true,
          showParams: true,
        },
        features: [],
      },
    };
  }

  return {
    tooltip: {
      title: {
        show: false,
        showName: false,
        showParams: false,
      },
      features,
    },
  };
};
