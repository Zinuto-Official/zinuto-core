// SPDX-License-Identifier: GPL-3.0-only

import type { TooltipFeatureStyle } from 'klinecharts';

const CUSTOM_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX = 'custom-indicator-tooltip:';
const INDICATOR_TOOLTIP_NAME_FONT_FAMILY = 'system-ui';
const INDICATOR_TOOLTIP_NAME_FONT_SIZE_PX = 12;

export const CUSTOM_INDICATOR_TOOLTIP_TARGET_ACTIVE_SCRIPT = 'active-script';
export const CUSTOM_INDICATOR_TOOLTIP_TARGET_SYSTEM_VOLUME = 'system-volume';

export const buildCustomIndicatorTooltipFeatureId = (target: string): string =>
  `${CUSTOM_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX}${String(target || '').trim()}`;

export const resolveCustomIndicatorTooltipFeatureTarget = (
  featureId: unknown,
): string | null => {
  const normalizedFeatureId = String(featureId ?? '').trim();
  if (!normalizedFeatureId.startsWith(CUSTOM_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX)) {
    return null;
  }
  const target = normalizedFeatureId.slice(
    CUSTOM_INDICATOR_TOOLTIP_FEATURE_ID_PREFIX.length,
  );
  return target || null;
};

type CreateCustomIndicatorTooltipNameFeatureArgs = {
  target: string;
  label: string;
  color: string;
  activeColor: string;
  backgroundColor: string;
};

export const createCustomIndicatorTooltipNameFeature = ({
  target,
  label,
  color,
  activeColor,
  backgroundColor,
}: CreateCustomIndicatorTooltipNameFeatureArgs): TooltipFeatureStyle => ({
  id: buildCustomIndicatorTooltipFeatureId(target),
  position: 'left',
  marginLeft: 0,
  marginTop: 0,
  marginRight: 6,
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
  type: 'icon_font',
  content: {
    family: INDICATOR_TOOLTIP_NAME_FONT_FAMILY,
    code: String(label || '').trim(),
  },
});
