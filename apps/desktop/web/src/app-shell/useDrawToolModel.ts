// SPDX-License-Identifier: GPL-3.0-only

import type { ActiveDrawTool, DrawTool } from "@/domains/chart/drawingTypes";
import type { UiLanguage } from "@/frontend-kernel/typography";
import { useEffect, useMemo, useState } from 'react';
import {
  DRAW_TOOL_EXCLUDED_NATIVE_NAMES,
  DRAW_TOOL_INTERNAL_NAMES,
  DRAW_TOOL_LABELS,
  DRAW_TOOL_PREFERRED_ORDER,
  buildDrawShortcutByTool
} from '@/ui/config/uiConfig';

type UseDrawToolModelArgs = {
  language: UiLanguage;
  chartReady: boolean;
};

const normalizeDrawToolOptions = (
  sourceNames: readonly unknown[],
  configuredDrawToolNameSet: ReadonlySet<string>,
): DrawTool[] => {
  const allNative = sourceNames
    .map((item) => String(item ?? '').trim())
    .filter(
      (item) =>
        Boolean(item) &&
        configuredDrawToolNameSet.has(item) &&
        !DRAW_TOOL_INTERNAL_NAMES.has(item) &&
        !DRAW_TOOL_EXCLUDED_NATIVE_NAMES.has(item)
    );
  const merged = Array.from(new Set(allNative));
  merged.sort((a, b) => {
    const aIndex = DRAW_TOOL_PREFERRED_ORDER.indexOf(a);
    const bIndex = DRAW_TOOL_PREFERRED_ORDER.indexOf(b);
    if (aIndex >= 0 && bIndex >= 0) {
      return aIndex - bIndex;
    }
    if (aIndex >= 0) {
      return -1;
    }
    if (bIndex >= 0) {
      return 1;
    }
    return a.localeCompare(b, 'en');
  });
  return merged as DrawTool[];
};

export const useDrawToolModel = ({ language, chartReady }: UseDrawToolModelArgs) => {
  const drawToolLabels = DRAW_TOOL_LABELS[language];
  const [nativeOverlayNames, setNativeOverlayNames] = useState<string[] | null>(null);

  const configuredDrawToolNameSet = useMemo(() => {
    const configured = Object.keys(drawToolLabels)
      .map((name) => String(name || '').trim())
      .filter((name) => Boolean(name) && name !== 'cursor');
    return new Set(configured);
  }, [drawToolLabels]);

  useEffect(() => {
    if (!chartReady) {
      return;
    }

    let disposed = false;
    void import('klinecharts')
      .then(({ getSupportedOverlays }) => {
        const nextOverlayNames = getSupportedOverlays()
          .map((item) => String(item ?? '').trim())
          .filter(Boolean);
        if (!disposed) {
          setNativeOverlayNames(nextOverlayNames);
        }
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
    };
  }, [chartReady]);

  const drawToolOptions = useMemo<DrawTool[]>(() => {
    const fallbackNames = [
      ...DRAW_TOOL_PREFERRED_ORDER,
      ...Array.from(configuredDrawToolNameSet),
    ];
    return normalizeDrawToolOptions(
      nativeOverlayNames ?? fallbackNames,
      configuredDrawToolNameSet
    );
  }, [configuredDrawToolNameSet, nativeOverlayNames]);

  const drawShortcutByTool = useMemo<Record<string, string>>(
    () => buildDrawShortcutByTool(['cursor', ...drawToolOptions] as ActiveDrawTool[]),
    [drawToolOptions]
  );

  const drawShortcutToolByKey = useMemo<Record<string, ActiveDrawTool>>(() => {
    const mapping: Record<string, ActiveDrawTool> = {};
    Object.entries(drawShortcutByTool).forEach(([tool, key]) => {
      if (!key) {
        return;
      }
      mapping[key] = tool as ActiveDrawTool;
    });
    return mapping;
  }, [drawShortcutByTool]);

  const drawShortcutItems = useMemo<Array<{ tool: ActiveDrawTool; key: string; keyDisplay: string; label: string }>>(
    () =>
      (['cursor', ...drawToolOptions] as ActiveDrawTool[])
        .map((tool) => {
          const key = drawShortcutByTool[tool];
          if (!key) {
            return null;
          }
          return {
            tool,
            key,
            keyDisplay: key.toUpperCase(),
            label: drawToolLabels[tool] ?? tool
          };
        })
        .filter((item): item is { tool: ActiveDrawTool; key: string; keyDisplay: string; label: string } => Boolean(item)),
    [drawShortcutByTool, drawToolLabels, drawToolOptions]
  );

  const drawTooltipByTool = useMemo<Record<string, string>>(() => {
    const mapping: Record<string, string> = {};
    (['cursor', ...drawToolOptions] as ActiveDrawTool[]).forEach((tool) => {
      const label = drawToolLabels[tool] ?? tool;
      const key = drawShortcutByTool[tool];
      mapping[tool] = key ? `${label} / ${key.toUpperCase()}` : label;
    });
    return mapping;
  }, [drawShortcutByTool, drawToolLabels, drawToolOptions]);

  return {
    drawToolLabels,
    drawToolOptions,
    drawShortcutByTool,
    drawShortcutToolByKey,
    drawShortcutItems,
    drawTooltipByTool
  };
};
