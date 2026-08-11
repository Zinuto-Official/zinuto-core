// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import "@/styles/popup-training.css";

import { useCallback, useState } from "react";
import { formatMessage } from "@zinuto/shared/i18n";
import { Button } from "@/ui/primitives/button";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import {
  closeCurrentDesktopSecondaryWindow,
  resizeCurrentDesktopSecondaryWindowToGeometry,
  resolveDesktopSecondaryWindowGeometry,
  sendDesktopSecondaryWindowRouteAction,
} from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import { tt, ttf } from "@/frontend-kernel/i18n/messageRuntime";
import {
  AppTrainerTradingSettingsPanel,
  AppTrainerModalHostProps,
  TrainerIndicatorSettingsPanel,
  type TrainerIndicatorSettingsWindowPayload,
} from "@/app-shell/AppTrainerModalHost";
import {
  SpecialTrainingBankEditorDrawer,
  type SpecialTrainingBankEditorWindowPayload,
} from "@/workspaces/special-training/SpecialTrainingBankEditorDrawer";
import {
  SPECIAL_TRAINING_BANK_EDITOR_STEPS,
  type SpecialTrainingBankEditorStep,
} from "@/workspaces/special-training/specialTrainingBankEditorModel";
import { SPECIAL_TRAINING_BANK_TIMEFRAME_OPTIONS } from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";
import { isSpecialTrainingBankDeleteConfirmWindowPayload } from "@/workspaces/special-training/specialTrainingBankDeleteConfirmWindow";
import { isSpecialTrainingModeRestartConfirmWindowPayload } from "@/workspaces/special-training/specialTrainingModeRestartConfirmWindow";
import type { ReplayTrainerSettingsPanelProps } from "@/domains/trainer/ReplayTrainerSettingsPanel";
import type { SignalIndicatorName } from "@/domains/indicators/core";
import type { TradingAssetClassId } from "@/domains/trainer/tradingMarketPresets";
import type { getTradingSettingsText } from "@/ui/config/uiConfig";
import {
  TrainerStartPointSecondaryWindow,
} from "@/workspaces/trainer/TrainerStartPointDrawer";
import {
  isTrainerStartPointWindowPayload,
} from "@/domains/trainer/trainerStartPointTypes";
import { TradingAssetSettingsPanel } from "@/workspaces/trainer/TradingAssetSettingsPanel";
import {
  SecondaryWindowRoutePlaceholder,
  type SecondaryWindowRouteProps,
} from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";

type TrainerTradingDefaultsPayload = {
  ttKeys?: never;
  uiText: AppTrainerModalHostProps["uiText"];
  tradingSettingsModal: Omit<
    AppTrainerModalHostProps["tradingSettingsModal"],
    | "onClose"
    | "onBuyTradeInputModeChange"
    | "onBuyLotInputChange"
    | "onBuyAmountInputChange"
    | "onBuyRatioInputChange"
    | "onBuyPriceModeChange"
  >;
};

const isTrainerTradingDefaultsPayload = (
  value: unknown,
): value is TrainerTradingDefaultsPayload =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean((value as TrainerTradingDefaultsPayload).uiText) &&
  Boolean((value as TrainerTradingDefaultsPayload).tradingSettingsModal);

type FunctionPropertyNames<T> = Extract<
  {
    [Key in keyof T]: T[Key] extends (...args: never[]) => unknown
      ? Key
      : never;
  }[keyof T],
  string
>;

type ReplayTrainerSettingsPanelCallbackKey =
  FunctionPropertyNames<ReplayTrainerSettingsPanelProps>;

type SerializableReplayTrainerSettingsPanel = Omit<
  ReplayTrainerSettingsPanelProps,
  ReplayTrainerSettingsPanelCallbackKey | "replaySettingsAssetClassOptions"
> & {
  replaySettingsAssetClassOptions: Array<{
    value: TradingAssetClassId;
    label: string;
  }>;
};

type TrainerTradingEnvironmentPayload = {
  tradingSettingsText: ReturnType<typeof getTradingSettingsText>;
  trainerSettingsPanel: SerializableReplayTrainerSettingsPanel;
  copy?: {
    title?: string;
    description?: string;
    presetNameLabel?: string;
  };
};

const isTrainerTradingEnvironmentPayload = (
  value: unknown,
): value is TrainerTradingEnvironmentPayload =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Boolean((value as TrainerTradingEnvironmentPayload).tradingSettingsText) &&
  Boolean((value as TrainerTradingEnvironmentPayload).trainerSettingsPanel);

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isSpecialTrainingBankEditorStep = (
  value: unknown,
): value is SpecialTrainingBankEditorStep =>
  typeof value === "string" &&
  SPECIAL_TRAINING_BANK_EDITOR_STEPS.includes(
    value as SpecialTrainingBankEditorStep,
  );

const isBaseTimeframe = (value: unknown): value is BaseTimeframe =>
  typeof value === "string" &&
  SPECIAL_TRAINING_BANK_TIMEFRAME_OPTIONS.includes(value as BaseTimeframe);

const isSpecialTrainingBankEditorWindowPayload = (
  value: unknown,
): value is SpecialTrainingBankEditorWindowPayload => {
  if (!isObjectRecord(value) || !isObjectRecord(value.draft)) {
    return false;
  }
  return (
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    isSpecialTrainingBankEditorStep(value.step) &&
    typeof value.draft.name === "string" &&
    Array.isArray(value.draft.poolIds) &&
    isBaseTimeframe(value.draft.targetTimeframe) &&
    Array.isArray(value.steps) &&
    Array.isArray(value.availablePoolOptions) &&
    Array.isArray(value.timeframeOptions)
  );
};

const isChartSettingsFocusTarget = (
  value: unknown,
): value is "main" | "top" | "bottom" =>
  value === "main" || value === "top" || value === "bottom";

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => Number.isFinite(item));

const isSelectOptionList = (
  value: unknown,
): value is TrainerIndicatorSettingsWindowPayload["mainIndicatorSelectOptions"] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      isObjectRecord(item) &&
      typeof item.key === "string" &&
      typeof item.label === "string",
  );

const isGroupedSignalIndicatorOptions = (
  value: unknown,
): value is TrainerIndicatorSettingsWindowPayload["signalIndicatorOptions"] =>
  isObjectRecord(value) &&
  isObjectRecord(value.noneOption) &&
  typeof value.noneOption.key === "string" &&
  typeof value.noneOption.label === "string" &&
  Array.isArray(value.groups) &&
  value.groups.every(
    (group) =>
      isObjectRecord(group) &&
      typeof group.key === "string" &&
      typeof group.label === "string" &&
      isSelectOptionList(group.options),
  );

const isTrainerIndicatorSettingsWindowPayload = (
  value: unknown,
): value is TrainerIndicatorSettingsWindowPayload => {
  if (!isObjectRecord(value)) {
    return false;
  }
  return (
    (value.focusedTarget === null ||
      value.focusedTarget === undefined ||
      isChartSettingsFocusTarget(value.focusedTarget)) &&
    typeof value.indicatorNoneValue === "string" &&
    typeof value.mainNativeIndicator === "string" &&
    isSelectOptionList(value.mainIndicatorSelectOptions) &&
    isNumberArray(value.mainNativeIndicatorParams) &&
    typeof value.mainIndicatorParamChanged === "boolean" &&
    typeof value.signalTopIndicator === "string" &&
    isNumberArray(value.signalTopIndicatorParams) &&
    typeof value.topIndicatorParamChanged === "boolean" &&
    typeof value.signalBottomIndicator === "string" &&
    isNumberArray(value.signalBottomIndicatorParams) &&
    typeof value.bottomIndicatorParamChanged === "boolean" &&
    isGroupedSignalIndicatorOptions(value.signalIndicatorOptions) &&
    typeof value.isSaving === "boolean" &&
    typeof value.saveDisabled === "boolean"
  );
};

const TrainerTradingDefaultsSecondaryWindow = ({
  state,
}: SecondaryWindowRouteProps) => {
  if (!isTrainerTradingDefaultsPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const payload = state.payload;
  const emit = (action: string, nextPayload?: unknown) => {
    void sendDesktopSecondaryWindowRouteAction(state, action, nextPayload).catch(
      () => undefined,
    );
  };

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-trading-defaults">
      <AppTrainerTradingSettingsPanel
        tt={tt}
        uiText={payload.uiText}
        tradingSettingsModal={{
          ...payload.tradingSettingsModal,
          onClose: () => {
            emit("CLOSE");
            void closeCurrentDesktopSecondaryWindow();
          },
          onBuyTradeInputModeChange: (mode) =>
            emit("SET_BUY_TRADE_INPUT_MODE", { mode }),
          onBuyLotInputChange: (value) => emit("SET_BUY_LOT_INPUT", { value }),
          onBuyAmountInputChange: (value) =>
            emit("SET_BUY_AMOUNT_INPUT", { value }),
          onBuyRatioInputChange: (value) =>
            emit("SET_BUY_RATIO_INPUT", { value }),
          onBuyPriceModeChange: (mode) => emit("SET_BUY_PRICE_MODE", { mode }),
        }}
      />
    </section>
  );
};

const SpecialTrainingBankEditorSecondaryWindow = ({
  state,
}: SecondaryWindowRouteProps) => {
  if (!isSpecialTrainingBankEditorWindowPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const payload = state.payload;
  const emit = (action: string, nextPayload?: unknown) => {
    void sendDesktopSecondaryWindowRouteAction(state, action, nextPayload).catch(
      () => undefined,
    );
  };
  const handleClose = () => {
    emit("CLOSE");
    void closeCurrentDesktopSecondaryWindow();
  };

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-special-training-bank-editor">
      <div className="special-training-bank-editor-inline-panel">
        <SpecialTrainingBankEditorDrawer
          {...payload}
          onClose={handleClose}
          onStepChange={(step) => emit("SET_STEP", { step })}
          onNameChange={(value) => emit("SET_NAME", { value })}
          onTogglePool={(poolId) => emit("TOGGLE_POOL", { poolId })}
          onRemoveMissingPool={(poolId) =>
            emit("REMOVE_MISSING_POOL", { poolId })
          }
          onTargetTimeframeChange={(timeframe) =>
            emit("SET_TARGET_TIMEFRAME", { timeframe })
          }
          onBack={() => emit("BACK")}
          onNext={() => emit("NEXT")}
          onSave={() => emit("SAVE")}
        />
      </div>
    </section>
  );
};

const TrainerIndicatorSettingsSecondaryWindow = ({
  state,
}: SecondaryWindowRouteProps) => {
  if (!isTrainerIndicatorSettingsWindowPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const payload = state.payload;
  const emit = (action: string, nextPayload?: unknown) => {
    void sendDesktopSecondaryWindowRouteAction(state, action, nextPayload).catch(
      () => undefined,
    );
  };
  const emitIndicatorWindowCommand = (action: "CLOSE" | "SAVE") => {
    void sendDesktopSecondaryWindowRouteAction(state, action).catch(
      () => undefined,
    );
  };
  const handleClose = () => {
    emitIndicatorWindowCommand("CLOSE");
    void closeCurrentDesktopSecondaryWindow();
  };
  const handleLayoutModeChange = useCallback(
    (layoutMode: { focusedTarget: "main" | "top" | "bottom" | null }) => {
      const geometryPayload = {
        ...payload,
        focusedTarget: layoutMode.focusedTarget,
      };
      void resizeCurrentDesktopSecondaryWindowToGeometry(
        resolveDesktopSecondaryWindowGeometry(
          "TRAINER_INDICATOR_SETTINGS",
          state.visualContext,
          { payload: geometryPayload },
        ),
      );
    },
    [payload, state.visualContext],
  );

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-indicator-settings">
      <TrainerIndicatorSettingsPanel
        tt={tt}
        ttf={ttf}
        chartSettingsModal={{
          ...payload,
          open: true,
          focusedTarget: payload.focusedTarget ?? null,
          onClose: handleClose,
          onMainNativeIndicatorChange: (value) =>
            emit("SET_MAIN_INDICATOR", { value }),
          onResetMainIndicatorParams: () =>
            emit("RESET_MAIN_INDICATOR_PARAMS"),
          onUpdateMainIndicatorParamAt: (index, value) =>
            emit("UPDATE_MAIN_INDICATOR_PARAM", { index, value }),
          onSignalTopIndicatorChange: (value: SignalIndicatorName) =>
            emit("SET_SIGNAL_TOP_INDICATOR", { value }),
          onResetTopIndicatorParams: () =>
            emit("RESET_TOP_INDICATOR_PARAMS"),
          onUpdateTopIndicatorParamAt: (index, value) =>
            emit("UPDATE_TOP_INDICATOR_PARAM", { index, value }),
          onSignalBottomIndicatorChange: (value: SignalIndicatorName) =>
            emit("SET_SIGNAL_BOTTOM_INDICATOR", { value }),
          onResetBottomIndicatorParams: () =>
            emit("RESET_BOTTOM_INDICATOR_PARAMS"),
          onUpdateBottomIndicatorParamAt: (index, value) =>
            emit("UPDATE_BOTTOM_INDICATOR_PARAM", { index, value }),
          onSave: () => emitIndicatorWindowCommand("SAVE"),
          onLayoutModeChange: handleLayoutModeChange,
        }}
      />
    </section>
  );
};

const TrainerTradingEnvironmentSecondaryWindow = ({
  state,
}: SecondaryWindowRouteProps) => {
  if (!isTrainerTradingEnvironmentPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const payload = state.payload;
  const emitCallback = (
    callbackName: ReplayTrainerSettingsPanelCallbackKey,
    ...args: unknown[]
  ) => {
    void sendDesktopSecondaryWindowRouteAction(state, "CALLBACK", {
      callbackName,
      args,
    }).catch(() => undefined);
  };
  const emitTradingEnvironmentSaveCommand = () => {
    void sendDesktopSecondaryWindowRouteAction(state, "SAVE").catch(
      () => undefined,
    );
  };
  const callbackProxy =
    (callbackName: ReplayTrainerSettingsPanelCallbackKey) =>
    (...args: unknown[]) =>
      emitCallback(callbackName, ...args);

  const trainerSettingsPanel: ReplayTrainerSettingsPanelProps = {
    ...payload.trainerSettingsPanel,
    replaySettingsAssetClassOptions:
      payload.trainerSettingsPanel.replaySettingsAssetClassOptions,
    onTradeMarkerDensityLevelChange: callbackProxy(
      "onTradeMarkerDensityLevelChange",
    ),
    onInitialSecuritiesInputChange: callbackProxy(
      "onInitialSecuritiesInputChange",
    ),
    onTradingAssetClassChange: callbackProxy("onTradingAssetClassChange"),
    onMinTradeStepInputChange: callbackProxy("onMinTradeStepInputChange"),
    onCommissionRateInputChange: callbackProxy("onCommissionRateInputChange"),
    onMakerFeeRateInputChange: callbackProxy("onMakerFeeRateInputChange"),
    onTakerFeeRateInputChange: callbackProxy("onTakerFeeRateInputChange"),
    onFundingRateInputChange: callbackProxy("onFundingRateInputChange"),
    onContractMultiplierInputChange: callbackProxy(
      "onContractMultiplierInputChange",
    ),
    onTransferFeeRateInputChange: callbackProxy("onTransferFeeRateInputChange"),
    onRegulatoryFeeRateInputChange: callbackProxy(
      "onRegulatoryFeeRateInputChange",
    ),
    onPlatformFeeRateInputChange: callbackProxy("onPlatformFeeRateInputChange"),
    onTransactionLevyRateInputChange: callbackProxy(
      "onTransactionLevyRateInputChange",
    ),
    onSlippageRateInputChange: callbackProxy("onSlippageRateInputChange"),
    onStampDutyRateInputChange: callbackProxy("onStampDutyRateInputChange"),
    onCommissionMinimumFeeInputChange: callbackProxy(
      "onCommissionMinimumFeeInputChange",
    ),
    onPlatformFeeMinimumFeeInputChange: callbackProxy(
      "onPlatformFeeMinimumFeeInputChange",
    ),
    onTransactionLevyMinimumFeeInputChange: callbackProxy(
      "onTransactionLevyMinimumFeeInputChange",
    ),
    onLongFinancingAnnualRateInputChange: callbackProxy(
      "onLongFinancingAnnualRateInputChange",
    ),
    onLongInitialMarginRatioInputChange: callbackProxy(
      "onLongInitialMarginRatioInputChange",
    ),
    onLongMaintenanceMarginRatioInputChange: callbackProxy(
      "onLongMaintenanceMarginRatioInputChange",
    ),
    onShortBorrowAnnualRateInputChange: callbackProxy(
      "onShortBorrowAnnualRateInputChange",
    ),
    onShortInitialMarginRatioInputChange: callbackProxy(
      "onShortInitialMarginRatioInputChange",
    ),
    onShortMaintenanceMarginRatioInputChange: callbackProxy(
      "onShortMaintenanceMarginRatioInputChange",
    ),
    onStampDutyModeChange: callbackProxy("onStampDutyModeChange"),
    onTradeSettlementModeChange: callbackProxy("onTradeSettlementModeChange"),
    onFreeReplayEndSettlementModeChange: callbackProxy(
      "onFreeReplayEndSettlementModeChange",
    ),
    onSelectTradingMarketPreset: callbackProxy("onSelectTradingMarketPreset"),
    onCreateTradingMarketPresetFromCurrent: callbackProxy(
      "onCreateTradingMarketPresetFromCurrent",
    ),
    onRenameTradingMarketPresetById: callbackProxy(
      "onRenameTradingMarketPresetById",
    ),
    onDeleteTradingMarketPresetById: callbackProxy(
      "onDeleteTradingMarketPresetById",
    ),
    onResetAllTradingAssetParameters: callbackProxy(
      "onResetAllTradingAssetParameters",
    ),
    onSaveTradingMarketPresetToCurrent: callbackProxy(
      "onSaveTradingMarketPresetToCurrent",
    ),
    onSaveTradingMarketPresetAsNew: callbackProxy(
      "onSaveTradingMarketPresetAsNew",
    ),
    onPositionCostModeChange: callbackProxy("onPositionCostModeChange"),
    onAllowLongMarginTradingChange: callbackProxy(
      "onAllowLongMarginTradingChange",
    ),
    onAllowShortSellingChange: callbackProxy("onAllowShortSellingChange"),
    onTradeAmountIncludesFeesChange: callbackProxy(
      "onTradeAmountIncludesFeesChange",
    ),
    onSave: emitTradingEnvironmentSaveCommand,
  };

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-trading-environment">
      <TradingAssetSettingsPanel
        tradingSettingsText={payload.tradingSettingsText}
        trainerSettingsPanel={trainerSettingsPanel}
        tt={tt}
        copy={{
          headerTitle: payload.copy?.title,
          headerDescription: payload.copy?.description,
          presetNameLabel: payload.copy?.presetNameLabel,
        }}
      />
    </section>
  );
};

const SpecialTrainingConfirmFrame = ({
  badgeLabel,
  title,
  description,
  cancelLabel,
  confirmLabel,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  badgeLabel: string;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) => (
  <section className="desktop-secondary-window-panel desktop-secondary-window-special-training-delete-confirm">
    <header className="special-training-bank-delete-confirm-header">
      <span className="special-training-bank-delete-confirm-badge">
        {badgeLabel}
      </span>
      <h1 className="special-training-bank-delete-confirm-title">{title}</h1>
      <p className="special-training-bank-delete-confirm-description">
        {description}
      </p>
    </header>
    <footer className="special-training-bank-delete-confirm-actions">
      <Button
        type="button"
        variant="secondary"
        onClick={onCancel}
        disabled={isSubmitting}
      >
        <VendorIcon name="x" />
        <span>{cancelLabel}</span>
      </Button>
      <Button
        type="button"
        variant="destructive"
        loading={isSubmitting}
        loadingLabel={confirmLabel}
        onClick={onConfirm}
      >
        <VendorIcon name="trash2" />
        <span>{confirmLabel}</span>
      </Button>
    </footer>
  </section>
);

const SpecialTrainingBankDeleteConfirmSecondaryWindow = ({
  state,
  language,
}: SecondaryWindowRouteProps) => {
  const payload = state.payload;
  if (!isSpecialTrainingBankDeleteConfirmWindowPayload(payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    void closeCurrentDesktopSecondaryWindow();
  };
  const handleConfirm = () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    void sendDesktopSecondaryWindowRouteAction(state, "CONFIRM_DELETE", {
      bankId: payload.bankId,
    })
      .then(() => {
        void closeCurrentDesktopSecondaryWindow();
      })
      .catch(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <SpecialTrainingConfirmFrame
      badgeLabel={formatMessage(
        language,
        "trainer.specialTrainingBanks.deleteAction",
      )}
      title={formatMessage(
        language,
        "trainer.specialTrainingBanks.deleteDialogTitle",
      )}
      description={formatMessage(
        language,
        "trainer.specialTrainingBanks.deleteDialogDescription",
        {
          name: payload.bankName,
        },
      )}
      cancelLabel={formatMessage(
        language,
        "trainer.specialTrainingBanks.deleteDialogCancelAction",
      )}
      confirmLabel={formatMessage(
        language,
        "trainer.specialTrainingBanks.deleteDialogConfirmAction",
      )}
      isSubmitting={isSubmitting}
      onCancel={handleClose}
      onConfirm={handleConfirm}
    />
  );
};

const SpecialTrainingModeRestartConfirmSecondaryWindow = ({
  state,
  language,
}: SecondaryWindowRouteProps) => {
  const payload = state.payload;
  if (!isSpecialTrainingModeRestartConfirmWindowPayload(payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    void closeCurrentDesktopSecondaryWindow();
  };
  const handleConfirm = () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    void sendDesktopSecondaryWindowRouteAction(state, "CONFIRM_RESTART_MODE", {
      modeId: payload.modeId,
    })
      .then(() => {
        void closeCurrentDesktopSecondaryWindow();
      })
      .catch(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <SpecialTrainingConfirmFrame
      badgeLabel={formatMessage(
        language,
        "trainer.questionBank.resetAction",
      )}
      title={formatMessage(
        language,
        "trainer.questionBank.resetDialogTitle",
      )}
      description={formatMessage(
        language,
        "trainer.questionBank.resetDialogDescription",
      )}
      cancelLabel={formatMessage(
        language,
        "trainer.questionBank.resetDialogCancelAction",
      )}
      confirmLabel={formatMessage(
        language,
        "trainer.questionBank.resetDialogConfirmAction",
      )}
      isSubmitting={isSubmitting}
      onCancel={handleClose}
      onConfirm={handleConfirm}
    />
  );
};

const SecondaryTrainingRoute = (props: SecondaryWindowRouteProps) => {
  if (props.kind === "TRAINER_TRADING_DEFAULTS") {
    return <TrainerTradingDefaultsSecondaryWindow {...props} />;
  }

  if (props.kind === "TRAINER_TRADING_ENVIRONMENT") {
    return <TrainerTradingEnvironmentSecondaryWindow {...props} />;
  }

  if (props.kind === "TRAINER_START_POINT") {
    if (!isTrainerStartPointWindowPayload(props.state.payload)) {
      return <SecondaryWindowRoutePlaceholder state={props.state} />;
    }
    return (
      <TrainerStartPointSecondaryWindow
        payload={props.state.payload}
        state={props.state}
      />
    );
  }

  if (props.kind === "TRAINER_INDICATOR_SETTINGS") {
    return <TrainerIndicatorSettingsSecondaryWindow {...props} />;
  }

  if (props.kind === "SPECIAL_TRAINING_BANK_EDITOR") {
    return <SpecialTrainingBankEditorSecondaryWindow {...props} />;
  }

  if (props.kind === "SPECIAL_TRAINING_BANK_DELETE_CONFIRM") {
    return <SpecialTrainingBankDeleteConfirmSecondaryWindow {...props} />;
  }

  if (props.kind === "SPECIAL_TRAINING_MODE_RESTART_CONFIRM") {
    return <SpecialTrainingModeRestartConfirmSecondaryWindow {...props} />;
  }

  return <SecondaryWindowRoutePlaceholder state={props.state} />;
};

export default SecondaryTrainingRoute;
