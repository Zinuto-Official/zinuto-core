// SPDX-License-Identifier: GPL-3.0-only

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { OrderInputMode as TradeInputMode } from "@zinuto/shared/trading";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { TradingOrderTicket } from "@/ui/components";
import { AppIcon } from "@/assets/graphics";
import { normalizeInput } from "@/frontend-kernel/valueFormat";
import { formatMoney } from "@/ui/formatting/format";
import {
  DEFAULT_RATIO_PRESET_INPUTS,
} from "@/domains/trainer/tradingFormUtils";
import { markTrainerHotInteractionInput } from "@/domains/trainer/trainerPerfTrace";
import type { StableRiskOrderTicketDisplayState } from "@/workspaces/special-training/view-models/specialTrainingRiskOrderQuoteDisplayState";

type SpecialTrainingRiskOrderTicketProps = {
  content: {
    controlNextBarLabel: string;
    fastArenaPassHotkeyLabel: string;
  };
  formatRiskOrderQuantity: (value: number | null) => string;
  handleBuyAndAdvance: () => Promise<void>;
  handleNextBar: () => Promise<void>;
  handleRiskOrderInputModeChange: (mode: TradeInputMode) => void;
  handleRiskRatioInputChange: (value: string) => void;
  handleSellAndAdvance: () => Promise<void>;
  handleUndo: () => Promise<void>;
  nextBarReason: string | null;
  riskAmountInput: string;
  riskAmountInputRef: RefObject<HTMLInputElement | null>;
  riskLotInput: string;
  riskLotInputRef: RefObject<HTMLInputElement | null>;
  riskOrderInputMode: TradeInputMode;
  riskOrderTicketDisplay: StableRiskOrderTicketDisplayState;
  riskPriceMode: "CUR_CLOSE" | "NEXT_OPEN";
  riskRatioInput: string;
  riskUndoButtonTitle: string;
  riskUndoReason: string | null;
  setRiskAmountInput: Dispatch<SetStateAction<string>>;
  setRiskLotInput: Dispatch<SetStateAction<string>>;
  setRiskPriceMode: Dispatch<SetStateAction<"CUR_CLOSE" | "NEXT_OPEN">>;
  textDoubleDash: string;
  textSlash: string;
  tt: (key: AppTextKey) => string;
  ui: {
    currentClose: string;
    nextBar: string;
    nextOpen: string;
  };
  undoAvailableRiskSteps: number;
  undoMaxRiskSteps: number;
};

export const SpecialTrainingRiskOrderTicket = ({
  content,
  formatRiskOrderQuantity,
  handleBuyAndAdvance,
  handleNextBar,
  handleRiskOrderInputModeChange,
  handleRiskRatioInputChange,
  handleSellAndAdvance,
  handleUndo,
  nextBarReason,
  riskAmountInput,
  riskAmountInputRef,
  riskLotInput,
  riskLotInputRef,
  riskOrderInputMode,
  riskOrderTicketDisplay,
  riskPriceMode,
  riskRatioInput,
  riskUndoButtonTitle,
  riskUndoReason,
  setRiskAmountInput,
  setRiskLotInput,
  setRiskPriceMode,
  textDoubleDash,
  textSlash,
  tt,
  ui,
  undoAvailableRiskSteps,
  undoMaxRiskSteps,
}: SpecialTrainingRiskOrderTicketProps) => (
  <TradingOrderTicket
    className="trainer-live-order-card"
    dataAutoshrinkIgnore
    inputMode={riskOrderInputMode}
    onInputModeChange={handleRiskOrderInputModeChange}
    quantityModeLabel={tt("appText.lots")}
    amountModeLabel={tt("appText.amount")}
    ratioModeLabel={tt("appText.ratio")}
    lotInputRef={riskLotInputRef}
    lotInput={riskLotInput}
    onLotInputChange={setRiskLotInput}
    quantityInputPlaceholder={tt("appText.lots")}
    quantityInputUnit={tt("appText.lots")}
    amountInputRef={riskAmountInputRef}
    amountInput={riskAmountInput}
    onAmountInputChange={setRiskAmountInput}
    amountInputPlaceholder={tt("appText.amount")}
    amountInputUnit="CNY"
    ratioInput={riskRatioInput}
    onRatioInputChange={handleRiskRatioInputChange}
    ratioPresetOptions={DEFAULT_RATIO_PRESET_INPUTS}
    percentSymbol={tt("appText.percent")}
    normalizeInput={normalizeInput}
    referenceLabel={tt("appText.fillPrice")}
    referenceValue={
      riskOrderTicketDisplay.referencePrice !== null &&
      riskOrderTicketDisplay.referencePrice > 0
        ? formatMoney(riskOrderTicketDisplay.referencePrice, 3)
        : textDoubleDash
    }
    referencePriceModeLabel={
      riskPriceMode === "NEXT_OPEN" ? ui.nextOpen : ui.currentClose
    }
    priceMode={riskPriceMode}
    onPriceModeChange={(mode) => {
      setRiskPriceMode(mode);
    }}
    currentCloseLabel={ui.currentClose}
    nextOpenLabel={ui.nextOpen}
    nextOpenUnavailable={riskOrderTicketDisplay.nextOpenUnavailable}
    buyEstimate={{
      quantityLabel: tt("appText.estBuy"),
      quantityValue: formatRiskOrderQuantity(
        riskOrderTicketDisplay.buyEstimate.qty,
      ),
      cashLabel: tt("appText.estimatedSpend"),
      cashValue:
        riskOrderTicketDisplay.buyEstimate.cashEffect !== null &&
        riskOrderTicketDisplay.buyEstimate.cashEffect > 0
          ? formatMoney(riskOrderTicketDisplay.buyEstimate.cashEffect)
          : textDoubleDash,
      disabled: riskOrderTicketDisplay.buyEstimate.disabled,
    }}
    sellEstimate={{
      quantityLabel: tt("appText.estSell"),
      quantityValue: formatRiskOrderQuantity(
        riskOrderTicketDisplay.sellEstimate.qty,
      ),
      cashLabel: tt("appText.estimatedProceeds"),
      cashValue:
        riskOrderTicketDisplay.sellEstimate.cashEffect !== null &&
        riskOrderTicketDisplay.sellEstimate.cashEffect > 0
          ? formatMoney(riskOrderTicketDisplay.sellEstimate.cashEffect)
          : textDoubleDash,
      disabled: riskOrderTicketDisplay.sellEstimate.disabled,
    }}
    buyAction={{
      tone: "buy",
      buttonClassName: riskOrderTicketDisplay.buyButton.className,
      disabled: riskOrderTicketDisplay.buyButton.disabled,
      onPointerDown: () =>
        markTrainerHotInteractionInput("BUY", "pointerdown"),
      onClick: () => {
        void handleBuyAndAdvance();
      },
      title: riskOrderTicketDisplay.buyButton.label,
      ariaLabel: riskOrderTicketDisplay.buyButton.label,
      label: riskOrderTicketDisplay.buyButton.label,
    }}
    sellAction={{
      tone: "sell",
      buttonClassName: riskOrderTicketDisplay.sellButton.className,
      disabled: riskOrderTicketDisplay.sellButton.disabled,
      onPointerDown: () =>
        markTrainerHotInteractionInput("SELL", "pointerdown"),
      onClick: () => {
        void handleSellAndAdvance();
      },
      title: riskOrderTicketDisplay.sellButton.label,
      ariaLabel: riskOrderTicketDisplay.sellButton.label,
      label: riskOrderTicketDisplay.sellButton.label,
    }}
    nextAction={{
      tone: "next",
      buttonClassName: "trade-next-action",
      disabled: false,
      reason: nextBarReason,
      onPointerDown: () =>
        markTrainerHotInteractionInput("STEP", "pointerdown"),
      onClick: () => {
        void handleNextBar();
      },
      title: `${content.controlNextBarLabel} ${textSlash} ${content.fastArenaPassHotkeyLabel}`,
      ariaLabel: `${content.controlNextBarLabel} ${textSlash} ${content.fastArenaPassHotkeyLabel}`,
      label: (
        <span className="trade-next-action-copy">
          <AppIcon
            name="actionFastForward"
            className="trade-next-action-icon"
            aria-hidden="true"
          />
          <span>{ui.nextBar}</span>
        </span>
      ),
    }}
    undoAction={{
      tone: "ghost",
      buttonClassName: "trade-undo-action",
      disabled: false,
      reason: riskUndoReason,
      onClick: () => {
        void handleUndo();
      },
      title: riskUndoButtonTitle,
      ariaLabel: riskUndoButtonTitle,
      label: (
        <span className="trade-undo-action-copy">
          <span>{tt("appText.undo")}</span>
          <span className="trade-undo-action-count">
            {`${undoAvailableRiskSteps}/${undoMaxRiskSteps}`}
          </span>
        </span>
      ),
    }}
  />
);
