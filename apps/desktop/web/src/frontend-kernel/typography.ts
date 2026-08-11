// SPDX-License-Identifier: GPL-3.0-only

export type FontSizePreset = "SMALL" | "STANDARD" | "LARGE";
export type UiLanguage = "en" | "zh-CN" | "ja" | "ko" | "es";

export type TypographyScriptGroup = "latin" | "cjk";
export type TypographyFamilyKind = "ui" | "display" | "mono";
export type TypographyReferenceToken =
  | "r1"
  | "r2"
  | "r3"
  | "r4"
  | "r5"
  | "r6"
  | "r7"
  | "r8";

type TypographyLineHeightToken =
  | "caption"
  | "label"
  | "body"
  | "title"
  | "metric"
  | "display";

type TypographyTrackingToken = "caption" | "label" | "body" | "title" | "display";

type TypographyContext = {
  language: UiLanguage;
  fontSizePreset: FontSizePreset;
};

type TypographyFontStacks = Record<TypographyFamilyKind, string>;
export type TypographyFitScale = {
  level1: number;
  level2: number;
};
type TypographyFontProfile = {
  fonts: TypographyFontStacks;
  scale: number;
  fitScale: TypographyFitScale;
};

export type TypographySystem = {
  scriptGroup: TypographyScriptGroup;
  fonts: TypographyFontStacks;
  fontScale: number;
  presetScale: number;
  fitScale: TypographyFitScale;
  referenceSizesPx: Record<TypographyReferenceToken, number>;
  lineHeights: Record<TypographyLineHeightToken, number>;
  tracking: Record<TypographyTrackingToken, string>;
  cssVariables: Record<string, string>;
};

const DEFAULT_CONTEXT: TypographyContext = {
  language: "en",
  fontSizePreset: "STANDARD",
};

const PRESET_SCALE_BY_PRESET: Record<FontSizePreset, number> = {
  SMALL: 0.92,
  STANDARD: 1,
  LARGE: 1.08,
};

const FONT_SCALE_BY_LANGUAGE: Record<UiLanguage, number> = {
  en: 0.98,
  "zh-CN": 0.98,
  ja: 0.96,
  ko: 0.97,
  es: 0.98,
};

const FIT_SCALE_BY_WIDTH_PROFILE: Record<"compact" | "expanded", TypographyFitScale> = {
  compact: {
    level1: 0.94,
    level2: 0.88,
  },
  expanded: {
    level1: 0.92,
    level2: 0.84,
  },
};

const BASE_SIZE_BY_REFERENCE: Record<TypographyReferenceToken, number> = {
  r1: 15,
  r2: 16,
  r3: 18,
  r4: 20,
  r5: 24,
  r6: 28,
  r7: 32,
  r8: 35,
};

const MONO_STACK = [
  "SF Mono",
  "Menlo",
  "Consolas",
  "Monaco",
  "ui-monospace",
  "monospace",
];

const buildFontStack = (...entries: string[]): string =>
  entries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => (entry.includes(" ") ? `'${entry}'` : entry))
    .join(", ");

const FONT_PROFILES_BY_LANGUAGE: Record<UiLanguage, TypographyFontProfile> = {
  en: {
    fonts: {
      ui: buildFontStack("SF Pro Text", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"),
      display: buildFontStack("SF Pro Display", "SF Pro Text", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"),
      mono: buildFontStack(...MONO_STACK),
    },
    scale: FONT_SCALE_BY_LANGUAGE.en,
    fitScale: FIT_SCALE_BY_WIDTH_PROFILE.expanded,
  },
  "zh-CN": {
    fonts: {
      ui: buildFontStack(
        "PingFang SC",
        "Hiragino Sans GB",
        "Microsoft YaHei UI",
        "Microsoft YaHei",
        "Noto Sans CJK SC",
        "sans-serif",
      ),
      display: buildFontStack(
        "PingFang SC",
        "Hiragino Sans GB",
        "Microsoft YaHei UI",
        "Microsoft YaHei",
        "Noto Sans CJK SC",
        "sans-serif",
      ),
      mono: buildFontStack(...MONO_STACK),
    },
    scale: FONT_SCALE_BY_LANGUAGE["zh-CN"],
    fitScale: FIT_SCALE_BY_WIDTH_PROFILE.compact,
  },
  ko: {
    fonts: {
      ui: buildFontStack(
        "Apple SD Gothic Neo",
        "Malgun Gothic",
        "Noto Sans CJK KR",
        "sans-serif",
      ),
      display: buildFontStack(
        "Apple SD Gothic Neo",
        "Malgun Gothic",
        "Noto Sans CJK KR",
        "sans-serif",
      ),
      mono: buildFontStack(...MONO_STACK),
    },
    scale: FONT_SCALE_BY_LANGUAGE.ko,
    fitScale: FIT_SCALE_BY_WIDTH_PROFILE.compact,
  },
  ja: {
    fonts: {
      ui: buildFontStack(
        "Hiragino Sans",
        "Yu Gothic UI",
        "Yu Gothic",
        "Meiryo",
        "Noto Sans CJK JP",
        "sans-serif",
      ),
      display: buildFontStack(
        "Hiragino Sans",
        "Yu Gothic UI",
        "Yu Gothic",
        "Meiryo",
        "Noto Sans CJK JP",
        "sans-serif",
      ),
      mono: buildFontStack(...MONO_STACK),
    },
    scale: FONT_SCALE_BY_LANGUAGE.ja,
    fitScale: FIT_SCALE_BY_WIDTH_PROFILE.compact,
  },
  es: {
    fonts: {
      ui: buildFontStack("SF Pro Text", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"),
      display: buildFontStack("SF Pro Display", "SF Pro Text", "Segoe UI", "Helvetica Neue", "Arial", "sans-serif"),
      mono: buildFontStack(...MONO_STACK),
    },
    scale: FONT_SCALE_BY_LANGUAGE.es,
    fitScale: FIT_SCALE_BY_WIDTH_PROFILE.expanded,
  },
};

const roundPx = (value: number): number => Number(value.toFixed(3));

const toPx = (value: number): string => `${roundPx(value)}px`;

export const resolveTypographyScriptGroup = (
  language: UiLanguage,
): TypographyScriptGroup =>
  language === "zh-CN" || language === "ko" || language === "ja"
    ? "cjk"
    : "latin";

const resolveReferenceScale = ({
  fontSizePreset,
  language,
}: Pick<TypographyContext, "fontSizePreset" | "language">): number => {
  const presetScale = PRESET_SCALE_BY_PRESET[fontSizePreset];
  const fontScale =
    (FONT_PROFILES_BY_LANGUAGE[language] ?? FONT_PROFILES_BY_LANGUAGE.en).scale;
  return presetScale * fontScale;
};

const buildReferenceSizeMap = (
  scale: number,
): Record<TypographyReferenceToken, number> => ({
  r1: roundPx(BASE_SIZE_BY_REFERENCE.r1 * scale),
  r2: roundPx(BASE_SIZE_BY_REFERENCE.r2 * scale),
  r3: roundPx(BASE_SIZE_BY_REFERENCE.r3 * scale),
  r4: roundPx(BASE_SIZE_BY_REFERENCE.r4 * scale),
  r5: roundPx(BASE_SIZE_BY_REFERENCE.r5 * scale),
  r6: roundPx(BASE_SIZE_BY_REFERENCE.r6 * scale),
  r7: roundPx(BASE_SIZE_BY_REFERENCE.r7 * scale),
  r8: roundPx(BASE_SIZE_BY_REFERENCE.r8 * scale),
});

const buildLineHeightMap = (
  scriptGroup: TypographyScriptGroup,
): Record<TypographyLineHeightToken, number> => {
  const body = scriptGroup === "latin" ? 1.45 : 1.55;
  const title = scriptGroup === "latin" ? 1.24 : 1.32;
  return {
    caption: body,
    label: title,
    body,
    title,
    metric: 1.2,
    display: title,
  };
};

const buildTrackingMap = (
  scriptGroup: TypographyScriptGroup,
): Record<TypographyTrackingToken, string> => {
  const emphasized = scriptGroup === "latin" ? "0.01em" : "0";
  return {
    caption: "0",
    label: emphasized,
    body: "0",
    title: emphasized,
    display: emphasized,
  };
};

export const resolveTypographySystem = (
  context: Partial<TypographyContext> = {},
): TypographySystem => {
  const merged: TypographyContext = {
    ...DEFAULT_CONTEXT,
    ...context,
  };
  const scriptGroup = resolveTypographyScriptGroup(merged.language);
  const fontProfile =
    FONT_PROFILES_BY_LANGUAGE[merged.language] ?? FONT_PROFILES_BY_LANGUAGE.en;
  const presetScale = PRESET_SCALE_BY_PRESET[merged.fontSizePreset];
  const fontScale = fontProfile.scale;
  const referenceScale = resolveReferenceScale(merged);
  const referenceSizesPx = buildReferenceSizeMap(referenceScale);
  const lineHeights = buildLineHeightMap(scriptGroup);
  const tracking = buildTrackingMap(scriptGroup);
  const { fonts, fitScale } = fontProfile;
  const cssVariables: Record<string, string> = {
    "--ff-ui": fonts.ui,
    "--ff-display": fonts.display,
    "--ff-mono": fonts.mono,
    "--ty-scale-font": String(fontScale),
    "--ty-scale-preset": String(presetScale),
    "--ty-fit-level-1": String(fitScale.level1),
    "--ty-fit-level-2": String(fitScale.level2),
    "--ty-r1": toPx(referenceSizesPx.r1),
    "--ty-r2": toPx(referenceSizesPx.r2),
    "--ty-r3": toPx(referenceSizesPx.r3),
    "--ty-r4": toPx(referenceSizesPx.r4),
    "--ty-r5": toPx(referenceSizesPx.r5),
    "--ty-r6": toPx(referenceSizesPx.r6),
    "--ty-r7": toPx(referenceSizesPx.r7),
    "--ty-r8": toPx(referenceSizesPx.r8),
    "--ty-leading-caption": String(lineHeights.caption),
    "--ty-leading-label": String(lineHeights.label),
    "--ty-leading-body": String(lineHeights.body),
    "--ty-leading-title": String(lineHeights.title),
    "--ty-leading-metric": String(lineHeights.metric),
    "--ty-leading-display": String(lineHeights.display),
    "--ty-tracking-caption": tracking.caption,
    "--ty-tracking-label": tracking.label,
    "--ty-tracking-body": tracking.body,
    "--ty-tracking-title": tracking.title,
    "--ty-tracking-display": tracking.display,
  };

  return {
    scriptGroup,
    fonts,
    fontScale,
    presetScale,
    fitScale,
    referenceSizesPx,
    lineHeights,
    tracking,
    cssVariables,
  };
};

let globalTypographyContext: TypographyContext = { ...DEFAULT_CONTEXT };
let globalTypographySystem = resolveTypographySystem(globalTypographyContext);

export const setGlobalTypographyContext = (
  context: Partial<TypographyContext>,
): TypographySystem => {
  globalTypographyContext = {
    ...globalTypographyContext,
    ...context,
  };
  globalTypographySystem = resolveTypographySystem(globalTypographyContext);
  return globalTypographySystem;
};

export const getGlobalTypographySystem = (): TypographySystem =>
  globalTypographySystem;

export const getGlobalTypographyReferencePx = (
  reference: TypographyReferenceToken,
): number => globalTypographySystem.referenceSizesPx[reference];

export const getGlobalTypographyFontFamily = (
  family: TypographyFamilyKind,
): string => globalTypographySystem.fonts[family];

export const buildTypographyCssVariables = (
  context: Partial<TypographyContext>,
): Record<string, string> => resolveTypographySystem(context).cssVariables;

export const buildCanvasFont = ({
  weight,
  size,
  family = "ui",
}: {
  weight: number | string;
  size: TypographyReferenceToken | number;
  family?: TypographyFamilyKind;
}): string => {
  const resolvedSize =
    typeof size === "number"
      ? roundPx(size)
      : getGlobalTypographyReferencePx(size);
  return `${weight} ${resolvedSize}px ${getGlobalTypographyFontFamily(family)}`;
};
