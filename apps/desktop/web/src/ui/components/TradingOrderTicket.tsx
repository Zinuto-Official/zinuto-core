// SPDX-License-Identifier: GPL-3.0-only

import { useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { Input } from "@/ui/primitives/input";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import { AppIcon } from "@/assets/graphics";
import { cn } from "@/ui/cn";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";

import { TradingEstimateBox } from "@/ui/components/TradingEstimateBox";
import { TradingManualActionDeck } from "@/ui/components/TradingManualActionDeck";

export type TradingOrderInputMode = "LOT" | "AMOUNT" | "RATIO";
export type TradingOrderPriceMode = "CUR_CLOSE" | "NEXT_OPEN";

const isTradingOrderInputMode = (
  value: unknown,
): value is TradingOrderInputMode =>
  value === "LOT" || value === "AMOUNT" || value === "RATIO";

export type TradingOrderActionDescriptor = {
  label: ReactNode;
  reason?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  onPointerDown?: () => void;
  title?: string;
  ariaLabel?: string;
  wrapClassName?: string;
  buttonClassName: string;
  tone: "buy" | "sell" | "next" | "ghost";
};

type TradingOrderEstimateSide = {
  quantityLabel: ReactNode;
  quantityValue: ReactNode;
  cashLabel: ReactNode;
  cashValue: ReactNode;
  executionBreakdown?: ReactNode;
  disabled?: boolean;
};

type TradingOrderTicketProps = {
  className?: string;
  dataAutoshrinkIgnore?: boolean;
  inputMode: TradingOrderInputMode;
  onInputModeChange: (mode: TradingOrderInputMode) => void;
  quantityModeLabel: string;
  amountModeLabel: string;
  ratioModeLabel: string;
  lotInputRef?: RefObject<HTMLInputElement | null>;
  lotInput: string;
  onLotInputChange: (value: string) => void;
  quantityInputPlaceholder: string;
  quantityInputUnit: ReactNode;
  amountInputRef?: RefObject<HTMLInputElement | null>;
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  amountInputPlaceholder: string;
  amountInputUnit: ReactNode;
  ratioInput: string;
  onRatioInputChange: (value: string) => void;
  ratioPresetOptions: ReadonlyArray<string>;
  percentSymbol: string;
  normalizeInput: (value: string) => string;
  referenceLabel: ReactNode;
  referenceValue: ReactNode;
  referencePriceModeLabel: ReactNode;
  priceMode: TradingOrderPriceMode;
  onPriceModeChange: (mode: TradingOrderPriceMode) => void;
  currentCloseLabel: ReactNode;
  nextOpenLabel: ReactNode;
  nextOpenUnavailable: boolean;
  buyEstimate: TradingOrderEstimateSide;
  sellEstimate: TradingOrderEstimateSide;
  buyAction: TradingOrderActionDescriptor;
  sellAction: TradingOrderActionDescriptor;
  nextAction: TradingOrderActionDescriptor;
  undoAction?: TradingOrderActionDescriptor | null;
};

export const TradingOrderTicket = ({
  className,
  dataAutoshrinkIgnore = false,
  inputMode,
  onInputModeChange,
  quantityModeLabel,
  amountModeLabel,
  ratioModeLabel,
  lotInputRef,
  lotInput,
  onLotInputChange,
  quantityInputPlaceholder,
  quantityInputUnit,
  amountInputRef,
  amountInput,
  onAmountInputChange,
  amountInputPlaceholder,
  amountInputUnit,
  ratioInput,
  onRatioInputChange,
  ratioPresetOptions,
  percentSymbol,
  normalizeInput,
  referenceLabel,
  referenceValue,
  referencePriceModeLabel,
  priceMode,
  onPriceModeChange,
  currentCloseLabel,
  nextOpenLabel,
  nextOpenUnavailable,
  buyEstimate,
  sellEstimate,
  buyAction,
  sellAction,
  nextAction,
  undoAction = null,
}: TradingOrderTicketProps) => {
  const [referencePriceModeMenuOpen, setReferencePriceModeMenuOpen] =
    useState(false);
  const lotModeActive = inputMode === "LOT";
  const amountModeActive = inputMode === "AMOUNT";
  const ratioModeActive = inputMode === "RATIO";

  return (
    <div
      className={cn("trade-side-card trade-merged-card", className)}
      data-autoshrink-ignore={dataAutoshrinkIgnore ? "true" : undefined}
    >
      <SegmentedControl
        size="sm"
        className="trade-live-segment order-mode-seg"
        gridTemplateColumns="repeat(3, minmax(0, 1fr))"
        value={inputMode}
        onChange={(value) => {
          if (isTradingOrderInputMode(value)) {
            onInputModeChange(value);
          }
        }}
        options={[
          {
            value: "LOT",
            label: quantityModeLabel,
          },
          {
            value: "AMOUNT",
            label: amountModeLabel,
          },
          {
            value: "RATIO",
            label: ratioModeLabel,
          },
        ]}
      />
      <div className="trade-input-slot">
        <div
          className={cn(
            "trade-input-mode-panel",
            lotModeActive && "is-active",
          )}
          aria-hidden={lotModeActive ? undefined : true}
        >
          <div className="trade-input-with-unit">
            <Input
              ref={lotInputRef}
              value={lotInput}
              disabled={!lotModeActive}
              tabIndex={lotModeActive ? undefined : -1}
              maxLength={INPUT_LIMITS.orderInputChars}
              onChange={(event) =>
                onLotInputChange(normalizeInput(event.target.value))
              }
              placeholder={quantityInputPlaceholder}
            />
            <span className="trade-input-unit">{quantityInputUnit}</span>
          </div>
        </div>
        <div
          className={cn(
            "trade-input-mode-panel",
            amountModeActive && "is-active",
          )}
          aria-hidden={amountModeActive ? undefined : true}
        >
          <div className="trade-input-with-unit">
            <Input
              ref={amountInputRef}
              value={amountInput}
              disabled={!amountModeActive}
              tabIndex={amountModeActive ? undefined : -1}
              maxLength={INPUT_LIMITS.orderInputChars}
              onChange={(event) =>
                onAmountInputChange(normalizeInput(event.target.value))
              }
              placeholder={amountInputPlaceholder}
            />
            <span className="trade-input-unit">{amountInputUnit}</span>
          </div>
        </div>
        <div
          className={cn(
            "trade-input-mode-panel",
            ratioModeActive && "is-active",
          )}
          aria-hidden={ratioModeActive ? undefined : true}
        >
          <SegmentedControl
            size="sm"
            className="trade-live-segment trade-ratio-preset-segment"
            gridTemplateColumns="repeat(4, minmax(0, 1fr))"
            value={ratioInput}
            onChange={(value) => {
              if (ratioModeActive) {
                onRatioInputChange(value);
              }
            }}
            options={ratioPresetOptions.map((ratio) => ({
              value: ratio,
              label: `${ratio}${percentSymbol}`,
              disabled: !ratioModeActive,
            }))}
          />
        </div>
      </div>
      <TradingEstimateBox
        referenceLabel={referenceLabel}
        referenceValue={referenceValue}
        referenceModeControl={
          <DropdownMenu
            open={referencePriceModeMenuOpen}
            onOpenChange={setReferencePriceModeMenuOpen}
          >
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className={`estimate-price-mode-trigger ${
                  referencePriceModeMenuOpen ? "is-open" : ""
                }`}
                aria-label={`${String(referenceLabel ?? "")} ${String(referencePriceModeLabel ?? "")}`}
              >
                <span className="estimate-price-mode-trigger-text">
                  {"("}
                  {referencePriceModeLabel}
                  {")"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={6}
              className="estimate-price-mode-menu"
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <DropdownMenuItem
                className={`estimate-price-mode-item ${
                  priceMode === "CUR_CLOSE" ? "is-selected" : ""
                }`}
                onSelect={() => onPriceModeChange("CUR_CLOSE")}
              >
                <span className="estimate-price-mode-item-copy">
                  <AppIcon
                    name="actionCheck"
                    className={`estimate-price-mode-item-icon ${
                      priceMode === "CUR_CLOSE" ? "is-visible" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span>{currentCloseLabel}</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className={`estimate-price-mode-item ${
                  priceMode === "NEXT_OPEN" ? "is-selected" : ""
                }`}
                data-availability={
                  nextOpenUnavailable ? "backend-blocked" : "available"
                }
                onSelect={() => onPriceModeChange("NEXT_OPEN")}
              >
                <span className="estimate-price-mode-item-copy">
                  <AppIcon
                    name="actionCheck"
                    className={`estimate-price-mode-item-icon ${
                      priceMode === "NEXT_OPEN" ? "is-visible" : ""
                    }`}
                    aria-hidden="true"
                  />
                  <span>{nextOpenLabel}</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        buy={buyEstimate}
        sell={sellEstimate}
      />
      <TradingManualActionDeck
        buy={buyAction}
        sell={sellAction}
        next={nextAction}
        undo={undoAction}
      />
    </div>
  );
};
