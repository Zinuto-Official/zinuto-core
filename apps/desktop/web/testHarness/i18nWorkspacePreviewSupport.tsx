// SPDX-License-Identifier: GPL-3.0-only

import {
  resolveSupportedLocale,
  type SupportedLocale,
} from "@zinuto/shared/i18n";
import { useState } from "react";
import type { ApiTrainingProject } from "../src/api";
import { AnchorNavigatorControl } from "../src/domains/trainer/AnchorNavigatorControl";
import type { ReplayTrainerSettingsPanelProps } from "../src/domains/trainer/ReplayTrainerSettingsPanel";
import type {
  DisplayPeriodKey,
  FreeReplayAdvancePeriod,
} from "../src/domains/training/types";
import {
  setTextLanguage,
  ttByLanguage,
} from "../src/frontend-kernel/i18n/messageRuntime";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";
import {
  getTradingSettingsText,
  type AppUiLanguage,
} from "../src/ui/config/uiConfig";
import { getUiLabels } from "../src/ui/config/uiLabels";
import { Button } from "../src/ui/primitives/button";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";
import {
  previewReviewBundle,
  previewReviewProjects,
} from "./i18nWorkspaceReviewFixtures";
import { installI18nWorkspacePreviewApiMocks } from "./installI18nWorkspacePreviewApiMocks";

export type PreviewPageId =
  | "COMMAND_CENTER"
  | "TRAINER"
  | "SPECIAL_TRAINING"
  | "CHALLENGE_STATS"
  | "HISTORY"
  | "NOTES"
  | "NOTES_EMPTY"
  | "NOTES_FILTERED_EMPTY"
  | "NOTES_COMPOSE"
  | "CUSTOM_INDICATOR"
  | "STRATEGY_BACKTEST"
  | "STRATEGY_BACKTEST_DETAIL"
  | "DATA"
  | "DATA_ACQUISITION"
  | "DATA_IMPORT_MODAL"
  | "DATA_IMPORT_MODAL_ERROR"
  | "TRAINER_START_POINT_DRAWER"
  | "TRAINER_START_POINT_DRAWER_TOGGLE"
  | "SETTINGS"
  | "SETTINGS_GENERAL"
  | "SETTINGS_DATA_TRANSFER"
  | "SETTINGS_SIMULATION"
  | "SETTINGS_ABOUT"
  | "SETTINGS_ADVANCED"
  | "SETTINGS_BLOCKED";

const query = new URLSearchParams(window.location.search);
export const locale = resolveSupportedLocale(
  query.get("locale"),
) as SupportedLocale;
export const requestedPage = (
  query.get("page") || "COMMAND_CENTER"
).toUpperCase() as PreviewPageId;
export const requestedTheme = query.get("theme") === "dark" ? "dark" : "light";
export const requestedScenario = (query.get("scenario") || "").toLowerCase();
export const floatingHelpPreviewMode = query.get("help");
export const showFloatingHelpPreview =
  floatingHelpPreviewMode === "floating" ||
  floatingHelpPreviewMode === "launcher";
export const language = (locale === "en-XA" ? "en" : locale) as AppUiLanguage;
export const isSettingsPreviewPage =
  requestedPage === "SETTINGS" ||
  requestedPage === "SETTINGS_GENERAL" ||
  requestedPage === "SETTINGS_DATA_TRANSFER" ||
  requestedPage === "SETTINGS_SIMULATION" ||
  requestedPage === "SETTINGS_ABOUT" ||
  requestedPage === "SETTINGS_ADVANCED" ||
  requestedPage === "SETTINGS_BLOCKED";

const workspaceFrameDuplicateShellSelector = [
  ".notes-curation-layout",
  ".settings-system-shell",
  ".data-config-single-panel",
].join(", ");

export const i18nPreviewStabilityStyle = `
[data-i18n-preview-root="true"],
[data-i18n-preview-root="true"] *,
[data-i18n-preview-root="true"] *::before,
[data-i18n-preview-root="true"] *::after {
  animation-delay: 0ms !important;
  animation-duration: 0ms !important;
  scroll-behavior: auto !important;
  transition-delay: 0ms !important;
  transition-duration: 0ms !important;
}
`;

setTextLanguage(language);

export const noop = (): void => {};
export const noopAsync = async (): Promise<void> => {};
export const noopAsyncResult = async () => ({
  deletedSessionRows: 0,
  deletedQuestionRows: 0,
});
export const resolvePreviewSamplePoolDisplayName = (
  samplePoolId: string,
  fallbackName = "",
): string => fallbackName || samplePoolId;
export const previewOperatorSummary: ApiTrainingProject["operatorSummary"] = {
  operatorKind: "HUMAN",
  operationMode: null,
  operatorSource: null,
  clientLabel: null,
  modelLabel: null,
  runId: null,
  actionCount: 0,
  orderCount: 0,
  decisionCount: 0,
  decisionSecondsUsed: 0,
  nonTradeActionCount: 0,
  errorActionCount: 0,
  forcedLiquidationCount: 0,
};

export const buildTradeExecutionBreakdown = () => ({
  closeQty: 0,
  openQty: 0,
  closeDirection: null,
  openDirection: null,
});

export const PREVIEW_START_POINT_TOTAL_BARS = 2400;
export const PREVIEW_START_POINT_SYMBOL = "ZINUTO.CN";

const buildPreviewStartPointBars = () => {
  const bars: Array<{
    ts: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    startRawIndex: number;
    endRawIndex: number;
    startTrainingIndex: number;
    endTrainingIndex: number;
  }> = [];
  const cursor = new Date(Date.UTC(2016, 0, 4, 0, 0, 0, 0));
  let index = 0;

  while (bars.length < PREVIEW_START_POINT_TOTAL_BARS) {
    const utcDay = cursor.getUTCDay();
    if (utcDay !== 0 && utcDay !== 6) {
      const baseline = 88 + index * 0.035;
      const wave = Math.sin(index / 28) * 5.4 + Math.cos(index / 9) * 1.8;
      const open = Number((baseline + wave).toFixed(2));
      const close = Number((open + Math.sin(index / 5) * 1.2).toFixed(2));
      const high = Number((Math.max(open, close) + 1.1).toFixed(2));
      const low = Number((Math.min(open, close) - 1.05).toFixed(2));
      bars.push({
        ts: cursor.toISOString(),
        open,
        high,
        low,
        close,
        volume: 120_000 + index * 17,
        startRawIndex: index,
        endRawIndex: index,
        startTrainingIndex: index,
        endTrainingIndex: index,
      });
      index += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return bars;
};

export const previewStartPointBars = buildPreviewStartPointBars();

export const getPreviewStartPointOverview = async (
  instrumentId: string,
  samplePoolId: string | undefined,
  minimumBaseTimeframe: FreeReplayAdvancePeriod,
  offset = 0,
  limit = 5000,
  range?: { displayPeriod?: DisplayPeriodKey },
) => {
  const normalizedOffset = Math.max(0, Math.floor(offset));
  const normalizedLimit = Math.max(1, Math.floor(limit));
  return {
    samplePoolId: samplePoolId ?? "preview-pool",
    instrumentId,
    symbol: PREVIEW_START_POINT_SYMBOL,
    sourceTimeframe: "1d" as const,
    minimumBaseTimeframe,
    effectiveTimeframe: minimumBaseTimeframe,
    displayPeriod: range?.displayPeriod ?? minimumBaseTimeframe,
    timeZone: "Asia/Shanghai",
    trainingTotal: previewStartPointBars.length,
    total: previewStartPointBars.length,
    offset: normalizedOffset,
    limit: normalizedLimit,
    bars: previewStartPointBars.slice(
      normalizedOffset,
      normalizedOffset + normalizedLimit,
    ),
  };
};

export const PreviewTrainerStartPointDrawerToggle = ({
  language,
  themeMode,
  labels,
}: {
  language: AppUiLanguage;
  themeMode: "light" | "dark";
  labels: ReturnType<typeof getUiLabels>;
}) => {
  const [open, setOpen] = useState(false);
  const previewAnchorIndex = 1139;
  const previewAnchorTs = previewStartPointBars[previewAnchorIndex]?.ts ?? null;
  const triggerLabel = ttByLanguage(language, "appText.trainingStart");

  return (
    <div
      className="desktop-main is-trainer"
      style={{ minHeight: "100vh", position: "relative" }}
    >
      <div style={{ padding: 24 }}>
        <Button type="button" onClick={() => setOpen(true)}>
          {triggerLabel}
        </Button>
      </div>
      {open ? (
        <section className="desktop-secondary-window-panel desktop-secondary-window-start-point trainer-start-point-drawer">
          <header className="desktop-secondary-window-start-point-header">
            <div className="desktop-secondary-window-start-point-title-block">
              <h1>{ttByLanguage(language, "appText.trainingStart")}</h1>
              <p>{`${ttByLanguage(language, "appText.symbol")} · ${PREVIEW_START_POINT_SYMBOL}`}</p>
            </div>
          </header>
          <div className="trainer-start-point-drawer-panel">
            <AnchorNavigatorControl
              samplePoolId="preview-pool"
              instrumentId="preview-instrument"
              symbol={PREVIEW_START_POINT_SYMBOL}
              sourceTimeframe="1d"
              effectiveTimeframe="1d"
              language={language}
              themeMode={themeMode}
              currentTotalBars={previewStartPointBars.length}
              currentAnchorOverviewIndex={previewAnchorIndex}
              currentAnchorTs={previewAnchorTs}
              variant="embedded"
              commitMode="immediate"
              getOverviewRange={getPreviewStartPointOverview}
              onApplyAnchor={noopAsync}
              ui={{
                startPoint: ttByLanguage(language, "appText.trainingStart"),
                dateRange: ttByLanguage(language, "appText.dateTime"),
                chartSettings: labels.chartSettings,
              }}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
};

export const installWorkspaceFrameAuditBridge = () => {
  const getContentRect = (node: HTMLElement) => {
    const rect = node.getBoundingClientRect();
    const styles = window.getComputedStyle(node);
    const paddingLeft = Number.parseFloat(styles.paddingLeft || "0") || 0;
    const paddingRight = Number.parseFloat(styles.paddingRight || "0") || 0;
    return {
      left: rect.left + paddingLeft,
      right: rect.right - paddingRight,
      width: Math.max(0, rect.width - paddingLeft - paddingRight),
    };
  };

  (
    window as typeof window & {
      __ZINUTO_WORKSPACE_FRAME_AUDIT__?: {
        collectRecords: () => Array<{
          fit: string | null;
          frameInlineStartDelta: number | null;
          frameInlineEndDelta: number | null;
          frameWidthDelta: number | null;
          frameBottomDelta: number | null;
          dividerTopDelta: number | null;
          dividerBottomDelta: number | null;
          duplicateShellBorders: number;
          bodyHasOverflow: boolean;
          bodyHasInlineOverflow: boolean;
        }>;
        collectShellRecords: () => Array<{
          shellInlineStartDelta: number | null;
          shellInlineEndDelta: number | null;
          shellWidthDelta: number | null;
          bodyHasInlineOverflow: boolean;
        }>;
      };
    }
  ).__ZINUTO_WORKSPACE_FRAME_AUDIT__ = {
    collectRecords: () => {
      const body = document.querySelector<HTMLElement>(
        '[data-page-slot="page-body"]',
      );
      const frames = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-workspace-frame-shell="true"]',
        ),
      );
      return frames.map((frame) => {
        const frameRect = frame.getBoundingClientRect();
        const bodyRect = body?.getBoundingClientRect() ?? null;
        const divider = frame.querySelector<HTMLElement>(
          ".page-main-layout-divider",
        );
        const dividerIsVisible = divider
          ? window.getComputedStyle(divider).display !== "none"
          : false;
        const dividerRect =
          divider && dividerIsVisible ? divider.getBoundingClientRect() : null;
        const duplicateShellBorders = Array.from(
          frame.querySelectorAll<HTMLElement>(
            workspaceFrameDuplicateShellSelector,
          ),
        ).filter((node) => {
          if (node === frame) {
            return false;
          }
          const styles = window.getComputedStyle(node);
          return (
            parseFloat(styles.borderTopWidth || "0") > 0.5 ||
            parseFloat(styles.borderRightWidth || "0") > 0.5 ||
            parseFloat(styles.borderBottomWidth || "0") > 0.5 ||
            parseFloat(styles.borderLeftWidth || "0") > 0.5
          );
        }).length;

        return {
          fit: frame.dataset.workspaceFrameFit ?? null,
          frameInlineStartDelta: bodyRect
            ? Math.abs(frameRect.left - bodyRect.left)
            : null,
          frameInlineEndDelta: bodyRect
            ? Math.abs(frameRect.right - bodyRect.right)
            : null,
          frameWidthDelta: bodyRect
            ? Math.abs(frameRect.width - bodyRect.width)
            : null,
          frameBottomDelta: bodyRect
            ? Math.abs(frameRect.bottom - bodyRect.bottom)
            : null,
          dividerTopDelta:
            dividerRect && bodyRect
              ? Math.abs(dividerRect.top - frameRect.top)
              : null,
          dividerBottomDelta:
            dividerRect && bodyRect
              ? Math.abs(dividerRect.bottom - frameRect.bottom)
              : null,
          duplicateShellBorders,
          bodyHasOverflow: body
            ? body.scrollHeight - body.clientHeight > 1
            : false,
          bodyHasInlineOverflow: body
            ? body.scrollWidth - body.clientWidth > 1
            : false,
        };
      });
    },
    collectShellRecords: () => {
      const shells = Array.from(
        document.querySelectorAll<HTMLElement>('[data-page-shell="true"]'),
      );
      const fallbackBoundary =
        document.querySelector<HTMLElement>(".desktop-main") ??
        document.querySelector<HTMLElement>(".app-root") ??
        document.documentElement;

      return shells.map((shell) => {
        const shellRect = shell.getBoundingClientRect();
        const boundary =
          shell.closest<HTMLElement>(".desktop-main") ?? fallbackBoundary;
        const boundaryRect = getContentRect(boundary);
        const body = shell.querySelector<HTMLElement>(
          '[data-page-slot="page-body"]',
        );

        return {
          shellInlineStartDelta: Math.abs(shellRect.left - boundaryRect.left),
          shellInlineEndDelta: Math.abs(shellRect.right - boundaryRect.right),
          shellWidthDelta: Math.abs(shellRect.width - boundaryRect.width),
          bodyHasInlineOverflow: body
            ? body.scrollWidth - body.clientWidth > 1
            : false,
        };
      });
    },
  };
};

const previewReviewProjectById = new Map(
  previewReviewProjects.map((project) => [project.id, project] as const),
);

installI18nWorkspacePreviewApiMocks({
  requestedPage,
  isSettingsPreviewPage,
  previewReviewBundle,
  previewReviewProjectById,
});

export const buildOrderEstimate = (side: "BUY" | "SELL") => ({
  side,
  price: 123.45,
  qty: 200,
  lots: 2,
  amount: 24690,
  tradingCost: 12.5,
  cashEffect: side === "BUY" ? -24702.5 : 24677.5,
  executionBreakdown: buildTradeExecutionBreakdown(),
});

export const buildPreviewTrainerSettingsPanel = ({
  labels,
  tradingSettingsText,
  tt,
}: {
  labels: ReturnType<typeof getUiLabels>;
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
  tt: (key: Parameters<typeof ttByLanguage>[1]) => string;
}): ReplayTrainerSettingsPanelProps => ({
  tradeMarkerDensityTitle: labels.tradeMarkerDensityRatio,
  tradeMarkerDensityValueText: `2${labels.tradeMarkerDensityLevelSuffix}`,
  tradeMarkerDensityHelpText: labels.tradeMarkerDensityRatioDesc,
  tradeMarkerDensityLevel: 2,
  replaySettingsDensityOptions: [
    { value: "1", label: `1${labels.tradeMarkerDensityLevelSuffix}` },
    { value: "2", label: `2${labels.tradeMarkerDensityLevelSuffix}` },
    { value: "3", label: `3${labels.tradeMarkerDensityLevelSuffix}` },
  ],
  onTradeMarkerDensityLevelChange: noop,
  initialSecuritiesInput: "128000",
  onInitialSecuritiesInputChange: noop,
  isInitialSecuritiesEditable: true,
  initialSecuritiesLockedReason: "",
  tradingAssetClass: "STOCK",
  replaySettingsAssetClassOptions: [
    { value: "STOCK", label: tradingSettingsText.assetClassLabels.STOCK },
    { value: "FUTURES", label: tradingSettingsText.assetClassLabels.FUTURES },
    { value: "FOREX", label: tradingSettingsText.assetClassLabels.FOREX },
    { value: "CRYPTO", label: tradingSettingsText.assetClassLabels.CRYPTO },
  ],
  onTradingAssetClassChange: noop,
  minTradeStepInput: "100",
  onMinTradeStepInputChange: noop,
  commissionRateInput: "0.03",
  onCommissionRateInputChange: noop,
  makerFeeRateInput: "0.02",
  onMakerFeeRateInputChange: noop,
  takerFeeRateInput: "0.04",
  onTakerFeeRateInputChange: noop,
  fundingRateInput: "0",
  onFundingRateInputChange: noop,
  contractMultiplierInput: "1",
  onContractMultiplierInputChange: noop,
  transferFeeRateInput: "0.002",
  onTransferFeeRateInputChange: noop,
  regulatoryFeeRateInput: "0.0027",
  onRegulatoryFeeRateInputChange: noop,
  platformFeeRateInput: "0.01",
  onPlatformFeeRateInputChange: noop,
  transactionLevyRateInput: "0.0027",
  onTransactionLevyRateInputChange: noop,
  slippageRateInput: "0.02",
  onSlippageRateInputChange: noop,
  stampDutyRateInput: "0.1",
  onStampDutyRateInputChange: noop,
  commissionMinimumFeeInput: "5",
  onCommissionMinimumFeeInputChange: noop,
  platformFeeMinimumFeeInput: "1",
  onPlatformFeeMinimumFeeInputChange: noop,
  transactionLevyMinimumFeeInput: "0",
  onTransactionLevyMinimumFeeInputChange: noop,
  longFinancingAnnualRateInput: "6",
  onLongFinancingAnnualRateInputChange: noop,
  longInitialMarginRatioInput: "50",
  onLongInitialMarginRatioInputChange: noop,
  longMaintenanceMarginRatioInput: "30",
  onLongMaintenanceMarginRatioInputChange: noop,
  shortBorrowAnnualRateInput: "8",
  onShortBorrowAnnualRateInputChange: noop,
  shortInitialMarginRatioInput: "60",
  onShortInitialMarginRatioInputChange: noop,
  shortMaintenanceMarginRatioInput: "35",
  onShortMaintenanceMarginRatioInputChange: noop,
  replaySettingsStampDutyOptions: [
    { value: "BUY", label: tradingSettingsText.stampDutyModeOptionLabels.BUY },
    {
      value: "SELL",
      label: tradingSettingsText.stampDutyModeOptionLabels.SELL,
    },
    {
      value: "DOUBLE",
      label: tradingSettingsText.stampDutyModeOptionLabels.DOUBLE,
    },
  ],
  stampDutyMode: "SELL",
  onStampDutyModeChange: noop,
  replaySettingsSettlementModeOptions: [
    {
      value: "T0",
      label: tradingSettingsText.tradeSettlementModeOptionLabels.T0,
    },
    {
      value: "T1",
      label: tradingSettingsText.tradeSettlementModeOptionLabels.T1,
    },
  ],
  tradeSettlementMode: "T1",
  onTradeSettlementModeChange: noop,
  replaySettingsFreeReplayEndSettlementModeOptions: [
    {
      value: "FORCE_CLOSE",
      label:
        tradingSettingsText.freeReplayEndSettlementModeOptionLabels.FORCE_CLOSE,
    },
    {
      value: "CURRENT_TOTAL_ASSET",
      label:
        tradingSettingsText.freeReplayEndSettlementModeOptionLabels
          .CURRENT_TOTAL_ASSET,
    },
  ],
  freeReplayEndSettlementMode: "FORCE_CLOSE",
  onFreeReplayEndSettlementModeChange: noop,
  marketPresetChips: [
    {
      id: "US_STOCK",
      label: tradingSettingsText.marketPresetLabels.US_STOCK,
      isBuiltIn: true,
      isCustom: false,
      isSelected: true,
      isUsedBySamplePool: true,
      canDelete: false,
    },
  ],
  onSelectTradingMarketPreset: noop,
  onCreateTradingMarketPresetFromCurrent: noop,
  onRenameTradingMarketPresetById: noop,
  onDeleteTradingMarketPresetById: noop,
  onResetAllTradingAssetParameters: noop,
  isTradingMarketPresetDirty: false,
  canSaveTradingMarketPresetToCurrent: false,
  onSaveTradingMarketPresetToCurrent: noop,
  onSaveTradingMarketPresetAsNew: noop,
  activeTradingMarketPresetLabel:
    tradingSettingsText.marketPresetLabels.US_STOCK,
  replaySettingsPositionCostOptions: [
    { value: "DILUTED", label: tt("appText.dilutedCost") },
    { value: "AVERAGE_OPEN", label: tt("appText.averageCost") },
  ],
  positionCostMode: "DILUTED",
  onPositionCostModeChange: noop,
  replaySettingsAllowLongOptions: [
    {
      value: "ALLOW",
      label: tradingSettingsText.allowLongMarginTradingOptionLabels.ALLOW,
    },
    {
      value: "DISALLOW",
      label: tradingSettingsText.allowLongMarginTradingOptionLabels.DISALLOW,
    },
  ],
  allowLongMarginTrading: true,
  onAllowLongMarginTradingChange: noop,
  replaySettingsAllowShortOptions: [
    {
      value: "ALLOW",
      label: tradingSettingsText.allowShortSellingOptionLabels.ALLOW,
    },
    {
      value: "DISALLOW",
      label: tradingSettingsText.allowShortSellingOptionLabels.DISALLOW,
    },
  ],
  allowShortSelling: true,
  onAllowShortSellingChange: noop,
  replaySettingsTradeAmountOptions: [
    { value: "EXCLUDE_FEES", label: tt("appText.excludingFees") },
    { value: "INCLUDE_FEES", label: tt("appText.includingFees") },
  ],
  tradeAmountIncludesFees: true,
  onTradeAmountIncludesFeesChange: noop,
  percentSymbol: "%",
  onSave: noop,
  isSavingTradingSettings: false,
  isBusy: false,
  isSaveDisabled: false,
});
