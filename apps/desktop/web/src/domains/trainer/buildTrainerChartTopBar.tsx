// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import { SearchSelectField } from "@/ui/primitives/search-select-field";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { AppIcon } from "@/assets/graphics";
import { formatCurrentMessage } from "@/frontend-kernel/i18n/messageRuntime";
import { formatMoney } from "@/ui/formatting/format";
import type { TrainerChartWorkspaceProps } from "@/domains/trainer/TrainerChartWorkspace";

type TrainerChartTopBarUiLabels = {
  random: string;
  randomPool: string;
  symbol: string;
  barsPerSec: string;
  pause: string;
  autoPlay: string;
};

type PoolOption = {
  id: string;
  name: string;
  symbolCount: number;
  disabled?: boolean;
};

type BuildTrainerChartTopBarParams = {
  isTrainingSymbolLocked: boolean;
  ui: TrainerChartTopBarUiLabels;
  activeSamplePoolSelectValue: string;
  readonlySamplePoolText?: string | null;
  selectSamplePoolOption: (poolId: string) => void;
  trainerSamplePoolOptions: PoolOption[];
  samplePoolAllId: string;
  noSamplePoolLabel: string;
  activeToolbarSymbolValue: string;
  readonlySymbolText?: string | null;
  selectSymbolOption: (symbol: string) => void;
  onPickRandomSymbol: () => void;
  symbolSelectOptions: string[];
  symbolSelectLabels: Record<string, string>;
  noSymbolLabel: string;
  hideSymbolIdentity?: boolean;
  hiddenSymbolLabel?: string;
  sessionId: string;
  isBusy: boolean;
  autoplayBarsPerSec: string;
  onAutoplayBarsPerSecChange: (value: string) => void;
  isAutoplay: boolean;
  onToggleAutoplay: () => void;
  anchorToolbarNode?: ReactNode;
  showRandomButton?: boolean;
};

const countVisualUnits = (text: string): number => {
  let units = 0;
  for (const char of String(text || "")) {
    const code = char.charCodeAt(0);
    // CJK / full-width glyphs occupy substantially more horizontal space than latin chars.
    const isWideGlyph =
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    units += isWideGlyph ? 1.9 : 1;
  }
  return units;
};

const estimateSelectWidthPx = (
  labels: string[],
  minPx: number,
  maxPx: number,
): number => {
  const longestUnits = labels.reduce(
    (max, label) => Math.max(max, countVisualUnits(label)),
    0,
  );
  // 7.8px ~ medium toolbar font average glyph width, plus trigger paddings/icon reserve.
  const estimated = Math.round(longestUnits * 7.8 + 40);
  return Math.max(minPx, Math.min(maxPx, estimated));
};

export const buildTrainerChartTopBar = ({
  isTrainingSymbolLocked,
  ui,
  activeSamplePoolSelectValue,
  readonlySamplePoolText,
  selectSamplePoolOption,
  trainerSamplePoolOptions,
  samplePoolAllId,
  noSamplePoolLabel,
  activeToolbarSymbolValue,
  readonlySymbolText,
  selectSymbolOption,
  onPickRandomSymbol,
  symbolSelectOptions,
  symbolSelectLabels,
  noSymbolLabel,
  hideSymbolIdentity = false,
  hiddenSymbolLabel = noSymbolLabel,
  sessionId,
  isBusy,
  autoplayBarsPerSec,
  onAutoplayBarsPerSecChange,
  isAutoplay,
  onToggleAutoplay,
  anchorToolbarNode,
  showRandomButton = true,
}: BuildTrainerChartTopBarParams): TrainerChartWorkspaceProps["topBar"] => {
  const poolOptionLabels = trainerSamplePoolOptions.length
    ? trainerSamplePoolOptions.map((pool) =>
        formatCurrentMessage("appText.value0Value12", [
          pool.name,
          formatMoney(pool.symbolCount, 0),
        ]),
      )
    : [noSamplePoolLabel];
  const symbolOptionLabels = symbolSelectOptions.length
    ? symbolSelectOptions.map((value) => symbolSelectLabels[value] ?? value)
    : [noSymbolLabel];

  const poolFieldWidthPx = estimateSelectWidthPx(poolOptionLabels, 180, 340);
  const symbolFieldWidthPx = estimateSelectWidthPx(
    symbolOptionLabels,
    152,
    240,
  );
  const isPoolReadonly = Boolean(readonlySamplePoolText);
  const isSymbolReadonly = Boolean(readonlySymbolText);
  const isPoolDisabled =
    isPoolReadonly ||
    !trainerSamplePoolOptions.length || isTrainingSymbolLocked || isBusy;
  const isSymbolDisabled =
    isSymbolReadonly ||
    hideSymbolIdentity ||
    !symbolSelectOptions.length ||
    isTrainingSymbolLocked ||
    isBusy;
  const isRandomDisabled =
    !showRandomButton ||
    !symbolSelectOptions.length || isTrainingSymbolLocked || isBusy;
  const showReadonlyMetaStrip = isPoolReadonly && isSymbolReadonly;
  const isInteractionDisabled =
    isPoolDisabled &&
    isSymbolDisabled &&
    isRandomDisabled &&
    !(anchorToolbarNode && !showReadonlyMetaStrip);

  const poolFieldStyle: CSSProperties = {
    maxWidth: `${poolFieldWidthPx}px`,
  };
  const symbolFieldStyle: CSSProperties = {
    maxWidth: `${symbolFieldWidthPx}px`,
  };
  const symbolSelectValue = activeToolbarSymbolValue;
  const displaySymbolText =
    readonlySymbolText ||
    (hideSymbolIdentity
      ? hiddenSymbolLabel
      : symbolSelectLabels[symbolSelectValue]) ||
    symbolSelectValue ||
    noSymbolLabel;

  return {
    className: "top-toolbar",
    left: (
      <div
        data-disabled={isInteractionDisabled ? "true" : "false"}
        className={`top-toolbar-form-group ${isTrainingSymbolLocked ? "is-locked" : ""} ${isInteractionDisabled ? "is-interaction-disabled" : ""}`}
        role="group"
        aria-label={`${ui.randomPool} / ${ui.symbol}`}
        data-autoshrink-ignore="true"
      >
        {showReadonlyMetaStrip ? (
          <div className="top-toolbar-readonly-stream">
            <span
              className="top-toolbar-readonly-stream-item top-toolbar-readonly-stream-item-symbol"
              title={readonlySymbolText ?? undefined}
            >
              {readonlySymbolText}
            </span>
          </div>
        ) : (
          <div className="top-toolbar-form-row top-toolbar-pool-symbol-cluster">
            <div
              className="top-toolbar-form-item top-toolbar-form-item-pool top-toolbar-cluster-segment top-toolbar-cluster-segment-pool"
              style={poolFieldStyle}
            >
              {isPoolReadonly ? (
                <div className="top-toolbar-readonly-field">
                  <span className="top-toolbar-readonly-text">
                    {readonlySamplePoolText}
                  </span>
                </div>
              ) : (
                <div className="toolbar-search-select top-toolbar-field">
                  <SearchSelectField
                    className="sample-pool-search-input"
                    aria-label={ui.randomPool}
                    searchPlaceholder={ui.randomPool}
                    density="compact"
                    value={activeSamplePoolSelectValue}
                    onValueChange={selectSamplePoolOption}
                    disabled={isPoolDisabled}
                    options={
                      trainerSamplePoolOptions.length
                        ? trainerSamplePoolOptions.map((pool) => ({
                            value: pool.id,
                            disabled: pool.disabled,
                            label: (
                              <>
                                {pool.name} {"("}
                                {formatMoney(pool.symbolCount, 0)}
                                {")"}
                              </>
                            ),
                            textValue: `${pool.name} (${formatMoney(pool.symbolCount, 0)})`,
                          }))
                        : [
                            {
                              value: samplePoolAllId,
                              label: noSamplePoolLabel,
                            },
                          ]
                    }
                  />
                </div>
              )}
            </div>
            <div
              className="top-toolbar-form-item top-toolbar-form-item-symbol top-toolbar-cluster-segment top-toolbar-cluster-segment-symbol"
              style={symbolFieldStyle}
            >
              {isSymbolReadonly ? (
                <div className="top-toolbar-readonly-field">
                  <span className="top-toolbar-readonly-text">
                    {readonlySymbolText}
                  </span>
                </div>
              ) : (
                <div className="toolbar-search-select top-toolbar-field">
                  <SearchSelectField
                    className="symbol-search-input"
                    aria-label={ui.symbol}
                    searchPlaceholder={ui.symbol}
                    density="compact"
                    value={symbolSelectValue}
                    onValueChange={selectSymbolOption}
                    disabled={isSymbolDisabled}
                    options={
                      hideSymbolIdentity
                        ? [
                            {
                              value: activeToolbarSymbolValue,
                              label: hiddenSymbolLabel,
                            },
                          ]
                        : symbolSelectOptions.length
                          ? symbolSelectOptions.map((value) => ({
                              value,
                              label: symbolSelectLabels[value] ?? value,
                            }))
                          : [{ value: "", label: noSymbolLabel }]
                    }
                  />
                </div>
              )}
            </div>
            {anchorToolbarNode ? (
              <div className="top-toolbar-form-item top-toolbar-form-item-anchor top-toolbar-cluster-segment top-toolbar-cluster-segment-anchor">
                {anchorToolbarNode}
              </div>
            ) : null}
            {showRandomButton ? (
              <div className="top-toolbar-form-item top-toolbar-form-item-random top-toolbar-cluster-segment top-toolbar-cluster-segment-random">
                <Tooltip delay={0}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={onPickRandomSymbol}
                      disabled={isRandomDisabled}
                      aria-label={ui.random}
                    >
                      <AppIcon
                        name="actionShuffleCross"
                        className="top-toolbar-random-icon"
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent sideOffset={6}>{ui.random}</TooltipContent>
                </Tooltip>
              </div>
            ) : null}
          </div>
        )}
      </div>
    ),
    center: (
      <div
        className="top-toolbar-symbol-title"
        title={displaySymbolText}
      >
        {displaySymbolText}
      </div>
    ),
    right: (
      <div
        className="inline-row core-main-actions core-main-actions-right top-toolbar-right-group"
        data-autoshrink-ignore="true"
      >
        <div className="autoplay-control-cluster">
          <div className="inline-row autoplay-speed-wrap">
            <Input
              className="autoplay-rate-input"
              density="compact"
              aria-label={ui.barsPerSec}
              value={autoplayBarsPerSec}
              onChange={(event) => onAutoplayBarsPerSecChange(event.target.value)}
            />
            <span className="muted top-toolbar-speed-unit">{ui.barsPerSec}</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="autoplay-toggle-btn"
            aria-pressed={isAutoplay}
            onClick={onToggleAutoplay}
            disabled={!sessionId}
          >
            {isAutoplay ? ui.pause : ui.autoPlay}
          </Button>
        </div>
      </div>
    ),
  };
};
