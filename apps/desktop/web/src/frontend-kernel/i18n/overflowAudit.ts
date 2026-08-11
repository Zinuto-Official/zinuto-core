// SPDX-License-Identifier: GPL-3.0-only

export type I18nOverflowRecord = {
  tagName: string;
  slot: string;
  text: string;
  widthOverflow: boolean;
  heightOverflow: boolean;
};

export type I18nContrastRecord = {
  tagName: string;
  text: string;
  color: string;
  backgroundColor: string;
  contrastRatio: number;
  requiredRatio: number;
  fontSize: string;
  fontWeight: string;
};

export type I18nButtonFitRecord = {
  element: string;
  tagName: string;
  text: string;
  widthOverflow: boolean;
  heightOverflow: boolean;
  scrollWidth: number;
  clientWidth: number;
  scrollHeight: number;
  clientHeight: number;
};

export type I18nContainerInlineOverflowRecord = {
  element: string;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
};

export type I18nOverlapRecord = {
  scope: string;
  first: string;
  second: string;
  overlapX: number;
  overlapY: number;
};

export type I18nDesktopLayoutRecords = {
  buttonFitRecords: I18nButtonFitRecord[];
  containerInlineOverflowRecords: I18nContainerInlineOverflowRecord[];
  overlapRecords: I18nOverlapRecord[];
};

type RgbaColor = {
  a: number;
  b: number;
  g: number;
  r: number;
};

const INLINE_OVERFLOW_CONTAINER_SELECTOR = [
  "html",
  "body",
  ".app-root",
  "[data-i18n-preview-root='true']",
  ".desktop-main",
  "[data-page-slot='page-body']",
  "[data-page-slot='page-toolbar']",
  "[data-workspace-frame-shell='true']",
  ".workspace-page",
  ".workspace-page-body",
  ".workspace-frame-shell",
  ".page-main-layout",
  ".page-sidebar-layout",
  "[role='dialog']",
  ".app-modal-surface",
  ".desktop-secondary-window-panel",
  ".data-config-transfer-dialog",
  ".csv-preview-modal-window",
  ".settings-modern-row",
  "[data-slot='segmented-control']",
  ".plain-tab-bar",
  ".sidebar-nav",
  ".sidebar-groups-content",
  ".training-command-center-mode-actions",
  ".training-stats-header-actions",
  ".training-stats-filter-actions",
  ".custom-indicator-workbench-actions",
  ".custom-indicator-reference-actions",
  ".data-config-detail-window-tabs",
  ".diagnostic-console-archive-actions",
  ".diagnostic-console-margin-session-actions",
  ".position-card-title-row",
  ".strategy-backtest-layout",
  ".strategy-backtest-secondary-layout",
  ".strategy-backtest-detail-panel",
  ".strategy-backtest-secondary-results",
  ".strategy-backtest-simple-view",
  ".strategy-backtest-analysis-tearsheet",
  ".strategy-backtest-analysis-grid",
  ".strategy-backtest-batch-list",
  ".strategy-backtest-secondary-result-list",
  ".strategy-backtest-fill-list",
].join(",");

const OVERLAP_SCOPE_SELECTOR = [
  "[data-slot='segmented-control']",
  ".plain-tab-bar",
  ".sidebar-group-items",
  "[data-i18n-slot='dialogFooter']",
  ".ui-standard-modal-actions",
  ".ui-standard-sheet-actions",
  ".app-modal-actions",
  ".training-command-center-mode-actions",
  ".training-stats-header-actions",
  ".training-stats-filter-actions",
  ".custom-indicator-workbench-actions",
  ".custom-indicator-reference-actions",
  ".diagnostic-console-archive-actions",
  ".diagnostic-console-margin-session-actions",
  ".data-config-detail-window-tabs",
  ".position-card-title-row",
  ".workbench-rail-section-actions",
  ".strategy-backtest-panel-head",
  ".strategy-backtest-run-summary",
  ".strategy-backtest-secondary-result-row",
  ".strategy-backtest-fill-row",
  ".strategy-backtest-section-head",
  ".strategy-backtest-distribution-stats",
  ".strategy-backtest-analysis-price-toggle",
].join(",");

const hasOverflow = (element: HTMLElement): Pick<I18nOverflowRecord, "widthOverflow" | "heightOverflow"> => ({
  widthOverflow: element.scrollWidth > element.clientWidth + 1,
  heightOverflow: element.scrollHeight > element.clientHeight + 1,
});

const rgbColorPattern =
  /rgba?\(\s*([0-9.]+)(?:\s+|,\s*)([0-9.]+)(?:\s+|,\s*)([0-9.]+)(?:\s*[,/]\s*([0-9.]+%?))?\s*\)/giu;
const colorFunctionPattern =
  /color\(\s*srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+%?))?\s*\)/giu;

const parseAlpha = (value: string | undefined): number => {
  if (!value) {
    return 1;
  }
  return value.endsWith("%")
    ? Math.max(0, Math.min(1, Number.parseFloat(value) / 100))
    : Math.max(0, Math.min(1, Number.parseFloat(value)));
};

const parseCssColor = (value: string): RgbaColor | null => {
  rgbColorPattern.lastIndex = 0;
  const rgbMatch = rgbColorPattern.exec(value);
  if (rgbMatch) {
    return {
      r: Number.parseFloat(rgbMatch[1] ?? "0"),
      g: Number.parseFloat(rgbMatch[2] ?? "0"),
      b: Number.parseFloat(rgbMatch[3] ?? "0"),
      a: parseAlpha(rgbMatch[4]),
    };
  }

  colorFunctionPattern.lastIndex = 0;
  const colorMatch = colorFunctionPattern.exec(value);
  if (colorMatch) {
    return {
      r: Number.parseFloat(colorMatch[1] ?? "0") * 255,
      g: Number.parseFloat(colorMatch[2] ?? "0") * 255,
      b: Number.parseFloat(colorMatch[3] ?? "0") * 255,
      a: parseAlpha(colorMatch[4]),
    };
  }

  return null;
};

const parseCssColorList = (value: string): RgbaColor[] => {
  const colors: RgbaColor[] = [];
  rgbColorPattern.lastIndex = 0;
  for (const match of value.matchAll(rgbColorPattern)) {
    colors.push({
      r: Number.parseFloat(match[1] ?? "0"),
      g: Number.parseFloat(match[2] ?? "0"),
      b: Number.parseFloat(match[3] ?? "0"),
      a: parseAlpha(match[4]),
    });
  }
  colorFunctionPattern.lastIndex = 0;
  for (const match of value.matchAll(colorFunctionPattern)) {
    colors.push({
      r: Number.parseFloat(match[1] ?? "0") * 255,
      g: Number.parseFloat(match[2] ?? "0") * 255,
      b: Number.parseFloat(match[3] ?? "0") * 255,
      a: parseAlpha(match[4]),
    });
  }
  return colors;
};

const blendColor = (foreground: RgbaColor, background: RgbaColor): RgbaColor => {
  const foregroundAlpha = Math.max(0, Math.min(1, foreground.a));
  const backgroundAlpha = Math.max(0, Math.min(1, background.a));
  const alpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  if (alpha <= 0) {
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  return {
    r:
      (foreground.r * foregroundAlpha +
        background.r * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    g:
      (foreground.g * foregroundAlpha +
        background.g * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    b:
      (foreground.b * foregroundAlpha +
        background.b * backgroundAlpha * (1 - foregroundAlpha)) /
      alpha,
    a: alpha,
  };
};

const relativeLuminance = (color: RgbaColor): number => {
  const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
    const normalized = Math.max(0, Math.min(255, channel)) / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};

const contrastRatio = (foreground: RgbaColor, background: RgbaColor): number => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
};

const formatRgb = (color: RgbaColor): string =>
  `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)})`;

const hasReadableText = (text: string): boolean =>
  /[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(text);

const normalizeAuditText = (text: string | null | undefined): string =>
  text?.replace(/\s+/gu, " ").trim() ?? "";

const isElementHiddenForAudit = (element: HTMLElement): boolean => {
  if (
    element.closest(
      "[aria-hidden='true'], [hidden], script, style, noscript, svg, canvas, .sr-only, [data-contrast-audit-ignore='true'], [data-i18n-layout-audit-ignore='true']",
    )
  ) {
    return true;
  }
  const style = window.getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.visibility === "collapse" ||
    Number.parseFloat(style.opacity || "1") <= 0.01
  ) {
    return true;
  }
  return element.getClientRects().length === 0;
};

const roundPixel = (value: number): number => Math.round(value * 100) / 100;

const describeAuditElement = (element: HTMLElement): string => {
  const parts = [element.tagName.toLowerCase()];
  if (element.id) {
    parts.push(`#${element.id}`);
  }
  const slot = element.dataset.slot ?? element.dataset.i18nSlot;
  if (slot) {
    parts.push(`[${slot}]`);
  }
  const classTokens = Array.from(element.classList).slice(0, 3);
  if (classTokens.length > 0) {
    parts.push(`.${classTokens.join(".")}`);
  }
  return parts.join("");
};

const readElementText = (element: HTMLElement): string =>
  normalizeAuditText(
    element.getAttribute("aria-label") || element.textContent || "",
  );

const isButtonLikeElement = (element: HTMLElement): boolean =>
  element.tagName.toLowerCase() === "button" ||
  element.getAttribute("role") === "button" ||
  element.dataset.slot === "button";

const isIconOnlyButton = (element: HTMLElement, text: string): boolean =>
  element.dataset.size?.startsWith("icon") === true || !hasReadableText(text);

const collectUniqueElements = (
  root: ParentNode,
  selector: string,
): HTMLElement[] => Array.from(new Set(root.querySelectorAll<HTMLElement>(selector)));

const resolveOpacity = (element: HTMLElement, root: HTMLElement): number => {
  let opacity = 1;
  let current: HTMLElement | null = element;
  while (current) {
    const currentOpacity = Number.parseFloat(
      window.getComputedStyle(current).opacity || "1",
    );
    if (Number.isFinite(currentOpacity)) {
      opacity *= currentOpacity;
    }
    if (current === root) {
      break;
    }
    current = current.parentElement;
  }
  return Math.max(0, Math.min(1, opacity));
};

const resolveBackgroundCandidates = (
  element: HTMLElement,
  root: HTMLElement,
): RgbaColor[] => {
  const rootStyle = window.getComputedStyle(root);
  const rootBackground = parseCssColor(rootStyle.backgroundColor);
  const rootCanvasChannels = rootStyle
    .getPropertyValue("--color-app-bg")
    .trim();
  const rootCanvasBackground = rootCanvasChannels
    ? parseCssColor(`rgb(${rootCanvasChannels})`)
    : null;
  const fallbackBackground =
    rootBackground && rootBackground.a > 0.05
      ? rootBackground
      : rootCanvasBackground ?? ({ r: 246, g: 249, b: 252, a: 1 } satisfies RgbaColor);
  let current: HTMLElement | null = element;
  while (current) {
    const style = window.getComputedStyle(current);
    const clipsText =
      style.backgroundClip === "text" ||
      style.getPropertyValue("-webkit-background-clip") === "text";
    const imageColors =
      style.backgroundImage && style.backgroundImage !== "none" && !clipsText
        ? parseCssColorList(style.backgroundImage)
        : [];
    const backgroundColor = parseCssColor(style.backgroundColor);
    const candidates = [
      ...imageColors.filter((color) => color.a > 0.05),
      ...(backgroundColor && backgroundColor.a > 0.05 ? [backgroundColor] : []),
    ];
    if (candidates.length > 0) {
      return candidates.map((candidate) =>
        candidate.a >= 1 ? candidate : blendColor(candidate, fallbackBackground),
      );
    }
    if (current === root) {
      break;
    }
    current = current.parentElement;
  }
  return [fallbackBackground];
};

const resolveRequiredContrastRatio = (element: HTMLElement): number => {
  const disabled = element.closest(
    ":disabled, [disabled], [aria-disabled='true'], [data-disabled='true'], .is-disabled, .is-locked, .no-data",
  );
  if (disabled) {
    return 3;
  }
  const style = window.getComputedStyle(element);
  const fontSize = Number.parseFloat(style.fontSize || "0");
  const fontWeight = Number.parseFloat(style.fontWeight || "400");
  if (fontSize >= 24 || (fontSize >= 18 && fontWeight >= 700)) {
    return 3;
  }
  return 4.5;
};

export const collectI18nOverflowRecords = (
  root: ParentNode = document,
): I18nOverflowRecord[] => {
  if (typeof document === "undefined") {
    return [];
  }
  return Array.from(
    root.querySelectorAll<HTMLElement>("[data-i18n-critical='true']"),
  )
    .map((element) => {
      const { widthOverflow, heightOverflow } = hasOverflow(element);
      return {
        tagName: element.tagName.toLowerCase(),
        slot: element.dataset.i18nSlot ?? "unknown",
        text: element.textContent?.replace(/\s+/gu, " ").trim() ?? "",
        widthOverflow,
        heightOverflow,
      };
    })
    .filter((entry) => entry.widthOverflow || entry.heightOverflow);
};

export const collectI18nContrastRecords = (
  root: ParentNode = document,
): I18nContrastRecord[] => {
  if (typeof document === "undefined") {
    return [];
  }
  return Array.from(root.querySelectorAll<HTMLElement>(".app-root.theme-light"))
    .flatMap((appRoot) => {
      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(appRoot, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
          const text = node.textContent?.replace(/\s+/gu, " ").trim() ?? "";
          if (!hasReadableText(text)) {
            return NodeFilter.FILTER_REJECT;
          }
          const parent = node.parentElement;
          if (!parent || isElementHiddenForAudit(parent)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      let currentNode = walker.nextNode();
      while (currentNode) {
        textNodes.push(currentNode as Text);
        currentNode = walker.nextNode();
      }
      return textNodes.map((textNode) => {
        const element = textNode.parentElement;
        if (!element) {
          return null;
        }
        const style = window.getComputedStyle(element);
        const foreground = parseCssColor(style.color);
        if (!foreground) {
          return null;
        }
        const effectiveForeground = blendColor(
          { ...foreground, a: foreground.a * resolveOpacity(element, appRoot) },
          resolveBackgroundCandidates(element, appRoot)[0] ??
            ({ r: 255, g: 255, b: 255, a: 1 } satisfies RgbaColor),
        );
        const backgroundCandidates = resolveBackgroundCandidates(element, appRoot);
        const ratios = backgroundCandidates.map((background) =>
          contrastRatio(effectiveForeground, background),
        );
        const actualRatio = Math.min(...ratios);
        const requiredRatio = resolveRequiredContrastRatio(element);
        if (actualRatio + 0.01 >= requiredRatio) {
          return null;
        }
        const backgroundColor =
          backgroundCandidates.find(
            (background) =>
              contrastRatio(effectiveForeground, background) === actualRatio,
          ) ?? backgroundCandidates[0];
        return {
          tagName: element.tagName.toLowerCase(),
          text: textNode.textContent?.replace(/\s+/gu, " ").trim() ?? "",
          color: formatRgb(effectiveForeground),
          backgroundColor: formatRgb(
            backgroundColor ?? ({ r: 255, g: 255, b: 255, a: 1 } satisfies RgbaColor),
          ),
          contrastRatio: Number(actualRatio.toFixed(2)),
          requiredRatio,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
        };
      });
    })
    .filter((entry): entry is I18nContrastRecord => Boolean(entry));
};

export const collectI18nButtonFitRecords = (
  root: ParentNode = document,
): I18nButtonFitRecord[] => {
  if (typeof document === "undefined") {
    return [];
  }

  return collectUniqueElements(root, "button, [role='button'], [data-slot='button']")
    .filter((element) => !isElementHiddenForAudit(element))
    .map((element) => {
      const text = readElementText(element);
      if (!isButtonLikeElement(element) || isIconOnlyButton(element, text)) {
        return null;
      }
      const widthOverflow = element.scrollWidth > element.clientWidth + 1;
      const heightOverflow = element.scrollHeight > element.clientHeight + 1;
      if (!widthOverflow && !heightOverflow) {
        return null;
      }
      return {
        element: describeAuditElement(element),
        tagName: element.tagName.toLowerCase(),
        text,
        widthOverflow,
        heightOverflow,
        scrollWidth: roundPixel(element.scrollWidth),
        clientWidth: roundPixel(element.clientWidth),
        scrollHeight: roundPixel(element.scrollHeight),
        clientHeight: roundPixel(element.clientHeight),
      };
    })
    .filter((entry): entry is I18nButtonFitRecord => Boolean(entry));
};

export const collectI18nContainerInlineOverflowRecords = (
  root: ParentNode = document,
): I18nContainerInlineOverflowRecord[] => {
  if (typeof document === "undefined") {
    return [];
  }

  return collectUniqueElements(root, INLINE_OVERFLOW_CONTAINER_SELECTOR)
    .filter((element) => !isElementHiddenForAudit(element))
    .map((element) => {
      if (element.scrollWidth <= element.clientWidth + 1) {
        return null;
      }
      const style = window.getComputedStyle(element);
      return {
        element: describeAuditElement(element),
        scrollWidth: roundPixel(element.scrollWidth),
        clientWidth: roundPixel(element.clientWidth),
        overflowX: style.overflowX,
      };
    })
    .filter((entry): entry is I18nContainerInlineOverflowRecord => Boolean(entry));
};

const isOverlapCandidate = (element: HTMLElement): boolean => {
  if (isElementHiddenForAudit(element)) {
    return false;
  }
  if (
    element.classList.contains("segmented-control-selection-indicator") ||
    element.classList.contains("plain-tab-bar-selection-indicator") ||
    element.classList.contains("sidebar-nav-selection-indicator")
  ) {
    return false;
  }
  const text = readElementText(element);
  return (
    hasReadableText(text) ||
    isButtonLikeElement(element) ||
    element.dataset.slot === "select-trigger" ||
    element.dataset.slot === "segmented-option"
  );
};

const intersectLength = (
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): number => Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));

export const collectI18nOverlapRecords = (
  root: ParentNode = document,
): I18nOverlapRecord[] => {
  if (typeof document === "undefined") {
    return [];
  }

  return collectUniqueElements(root, OVERLAP_SCOPE_SELECTOR).flatMap((scope) => {
    if (isElementHiddenForAudit(scope)) {
      return [];
    }
    const candidates = Array.from(scope.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .filter(isOverlapCandidate)
      .map((element) => ({
        element,
        rect: element.getBoundingClientRect(),
      }))
      .filter(({ rect }) => rect.width > 1 && rect.height > 1);

    const records: I18nOverlapRecord[] = [];
    for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
      const left = candidates[leftIndex];
      if (!left) {
        continue;
      }
      for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
        const right = candidates[rightIndex];
        if (!right) {
          continue;
        }
        const overlapX = intersectLength(
          left.rect.left,
          left.rect.right,
          right.rect.left,
          right.rect.right,
        );
        const overlapY = intersectLength(
          left.rect.top,
          left.rect.bottom,
          right.rect.top,
          right.rect.bottom,
        );
        if (overlapX <= 2 || overlapY <= 2) {
          continue;
        }
        records.push({
          scope: describeAuditElement(scope),
          first: describeAuditElement(left.element),
          second: describeAuditElement(right.element),
          overlapX: roundPixel(overlapX),
          overlapY: roundPixel(overlapY),
        });
      }
    }
    return records;
  });
};

export const collectI18nDesktopLayoutRecords = (
  root: ParentNode = document,
): I18nDesktopLayoutRecords => ({
  buttonFitRecords: collectI18nButtonFitRecords(root),
  containerInlineOverflowRecords: collectI18nContainerInlineOverflowRecords(root),
  overlapRecords: collectI18nOverlapRecords(root),
});

export const installI18nAuditBridge = (): (() => void) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const target = window as typeof window & {
    __ZINUTO_I18N_AUDIT__?: {
      collectDesktopLayoutRecords: () => I18nDesktopLayoutRecords;
      collectContrastRecords: () => I18nContrastRecord[];
      collectOverflowRecords: () => I18nOverflowRecord[];
    };
  };
  target.__ZINUTO_I18N_AUDIT__ = {
    collectDesktopLayoutRecords: () => collectI18nDesktopLayoutRecords(document),
    collectContrastRecords: () => collectI18nContrastRecords(document),
    collectOverflowRecords: () => collectI18nOverflowRecords(document),
  };
  return () => {
    delete target.__ZINUTO_I18N_AUDIT__;
  };
};
