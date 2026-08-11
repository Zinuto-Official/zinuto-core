// SPDX-License-Identifier: GPL-3.0-only

import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Keycap } from '@/ui/primitives/keycap';
import { SegmentedControl } from '@/ui/primitives/segmented-control';
import { SelectField } from '@/ui/primitives/select-field';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';
import type {
  OrderInputMode,
  PriceMode,
} from '@zinuto/shared/trading';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/ui/primitives/tooltip';
import type { AppTextKey } from '@/frontend-kernel/i18n/messageRuntime';
import { AppModal } from '@/ui/components/AppModal';
import type { SignalIndicatorName } from '@/domains/indicators/core';
import type {
  GroupedSignalIndicatorSelectOptions,
  IndicatorSelectOption,
} from '@/domains/indicators/catalog';
import type { ChartSettingsModalFocusTarget } from '@/domains/indicators/runtime';
import { AppIcon } from '@/assets/graphics';
import {
  IndicatorPanel,
  OptionStrip,
  SettingRow,
  StandardModalFrame,
} from '@/ui/components';
import { useEffect, useState, type ReactNode } from 'react';

type TradeInputMode = OrderInputMode;
type OrderPriceMode = PriceMode;

type DrawShortcutItem = {
  tool: string;
  keyDisplay: string;
  label: string;
};

type TrainerModalUiText = {
  shortcutTitle: string;
  shortcutModalDescription: string;
  shortcutGroupPlayback: string;
  shortcutGroupTrading: string;
  shortcutGroupDrawing: string;
  shortcutActionNextBar: string;
  shortcutActionAutoPlay: string;
  nextBar: string;
  autoPlay: string;
  currentClose: string;
  nextOpen: string;
};

export type TrainerIndicatorSettingsWindowPayload = {
  focusedTarget: ChartSettingsModalFocusTarget | null;
  indicatorNoneValue: string;
  mainNativeIndicator: string;
  mainIndicatorSelectOptions: IndicatorSelectOption[];
  mainNativeIndicatorParams: number[];
  mainIndicatorParamChanged: boolean;
  signalTopIndicator: SignalIndicatorName;
  signalTopIndicatorParams: number[];
  topIndicatorParamChanged: boolean;
  signalBottomIndicator: SignalIndicatorName;
  signalBottomIndicatorParams: number[];
  bottomIndicatorParamChanged: boolean;
  signalIndicatorOptions: GroupedSignalIndicatorSelectOptions;
  isSaving: boolean;
  saveDisabled: boolean;
};

export type TrainerIndicatorSettingsLayoutMode = {
  mode: 'overview' | 'parameter';
  focusedTarget: ChartSettingsModalFocusTarget | null;
};

export type TrainerIndicatorSettingsPanelModel =
  TrainerIndicatorSettingsWindowPayload & {
    open: boolean;
    onClose: () => void;
    onMainNativeIndicatorChange: (value: string) => void;
    onResetMainIndicatorParams: () => void;
    onUpdateMainIndicatorParamAt: (index: number, value: string) => void;
    onSignalTopIndicatorChange: (value: SignalIndicatorName) => void;
    onResetTopIndicatorParams: () => void;
    onUpdateTopIndicatorParamAt: (index: number, value: string) => void;
    onSignalBottomIndicatorChange: (value: SignalIndicatorName) => void;
    onResetBottomIndicatorParams: () => void;
    onUpdateBottomIndicatorParamAt: (index: number, value: string) => void;
    onSave: () => void;
    onLayoutModeChange?: (mode: TrainerIndicatorSettingsLayoutMode) => void;
  };

export type AppTrainerModalHostProps = {
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, values?: Array<unknown>) => string;
  uiText: TrainerModalUiText;
  shortcutModal: {
    open: boolean;
    onClose: () => void;
    addNoteKey: string;
    drawShortcutItems: DrawShortcutItem[];
  };
  chartSettingsModal: TrainerIndicatorSettingsPanelModel;
  tradingSettingsModal: {
    open: boolean;
    onClose: () => void;
    quantityModeLabel: string;
    quantityInputPlaceholder: string;
    amountModeLabel: string;
    amountInputPlaceholder: string;
    buyTradeInputMode: TradeInputMode;
    onBuyTradeInputModeChange: (mode: TradeInputMode) => void;
    buyLotInput: string;
    onBuyLotInputChange: (value: string) => void;
    buyAmountInput: string;
    onBuyAmountInputChange: (value: string) => void;
    buyRatioInput: string;
    buyRatioPresetOptions: ReadonlyArray<string>;
    onBuyRatioInputChange: (value: string) => void;
    buyPriceMode: OrderPriceMode;
    onBuyPriceModeChange: (mode: OrderPriceMode) => void;
    isBusy: boolean;
  };
};

export type AppTrainerTradingSettingsPanelProps = Pick<
  AppTrainerModalHostProps,
  "tt" | "uiText"
> & {
  tradingSettingsModal: AppTrainerModalHostProps["tradingSettingsModal"];
};

export const AppTrainerTradingSettingsPanel = ({
  tt,
  uiText,
  tradingSettingsModal,
}: AppTrainerTradingSettingsPanelProps) => (
  <StandardModalFrame
    variant="form"
    title={tt('appText.paperOrderDefaults')}
    actions={
      <Button
        variant="secondary"
        onClick={tradingSettingsModal.onClose}
        disabled={tradingSettingsModal.isBusy}
      >
        {tt('appText.done')}
      </Button>
    }
  >
    <div className="modal-section">
      <SettingRow
        className="modal-settings-row"
        title={tt('appText.buySellSharedUseSameInput')}
        control={
          <SegmentedControl
            className="modal-settings-seg"
            options={[
              { value: 'LOT', label: tradingSettingsModal.quantityModeLabel },
              { value: 'AMOUNT', label: tradingSettingsModal.amountModeLabel },
              { value: 'RATIO', label: tt('appText.ratio') }
            ]}
            value={tradingSettingsModal.buyTradeInputMode}
            onChange={(value) => tradingSettingsModal.onBuyTradeInputModeChange(value as TradeInputMode)}
          />
        }
      />

      {tradingSettingsModal.buyTradeInputMode === 'LOT' ? (
        <SettingRow
          className="modal-settings-row"
          title={tradingSettingsModal.quantityModeLabel}
          control={
            <Input
              className="modal-settings-input-sm"
              density="compact"
              value={tradingSettingsModal.buyLotInput}
              maxLength={INPUT_LIMITS.orderInputChars}
              onChange={(event) => tradingSettingsModal.onBuyLotInputChange(event.target.value)}
              placeholder={tradingSettingsModal.quantityInputPlaceholder}
            />
          }
        />
      ) : null}

      {tradingSettingsModal.buyTradeInputMode === 'AMOUNT' ? (
        <SettingRow
          className="modal-settings-row"
          title={tradingSettingsModal.amountModeLabel}
          control={
            <Input
              className="modal-settings-input-sm"
              density="compact"
              value={tradingSettingsModal.buyAmountInput}
              maxLength={INPUT_LIMITS.orderInputChars}
              onChange={(event) => tradingSettingsModal.onBuyAmountInputChange(event.target.value)}
              placeholder={tradingSettingsModal.amountInputPlaceholder}
            />
          }
        />
      ) : null}

      {tradingSettingsModal.buyTradeInputMode === 'RATIO' ? (
        <SettingRow
          className="modal-settings-row"
          title={tt('appText.ratio')}
          control={
            <OptionStrip
              className="trade-ratio-preset-seg"
              value={tradingSettingsModal.buyRatioInput}
              options={tradingSettingsModal.buyRatioPresetOptions.map((option) => ({
                value: option,
                label: `${option}${tt('appText.percent')}`,
              }))}
              onChange={(value) =>
                tradingSettingsModal.onBuyRatioInputChange(String(value))
              }
            />
          }
          controlFill
        />
      ) : null}

      <SettingRow
        className="modal-settings-row"
        title={tt('appText.fillPrice')}
        control={
          <SegmentedControl
            className="modal-settings-seg"
            options={[
              { value: 'CUR_CLOSE', label: uiText.currentClose },
              { value: 'NEXT_OPEN', label: uiText.nextOpen }
            ]}
            value={tradingSettingsModal.buyPriceMode}
            onChange={(value) => tradingSettingsModal.onBuyPriceModeChange(value as OrderPriceMode)}
          />
        }
      />
    </div>
  </StandardModalFrame>
);

export type TrainerIndicatorSettingsPanelProps = Pick<
  AppTrainerModalHostProps,
  "tt" | "ttf"
> & {
  chartSettingsModal: TrainerIndicatorSettingsPanelModel;
};

export const TrainerIndicatorSettingsPanel = ({
  tt,
  ttf,
  chartSettingsModal,
}: TrainerIndicatorSettingsPanelProps) => {
  const [indicatorConfigTarget, setIndicatorConfigTarget] =
    useState<ChartSettingsModalFocusTarget | null>(() =>
      chartSettingsModal.open ? chartSettingsModal.focusedTarget : null,
    );

  useEffect(() => {
    if (!chartSettingsModal.open) {
      setIndicatorConfigTarget(null);
      return;
    }
    setIndicatorConfigTarget(chartSettingsModal.focusedTarget);
  }, [chartSettingsModal.focusedTarget, chartSettingsModal.open]);

  const chartSettingsModalTitle = tt('appText.indicatorSettings');
  const closeIndicatorConfigModal = () => {
    setIndicatorConfigTarget(null);
    if (chartSettingsModal.focusedTarget !== null) {
      chartSettingsModal.onClose();
    }
  };
  const completeIndicatorConfigModal = () => {
    setIndicatorConfigTarget(null);
    if (chartSettingsModal.focusedTarget !== null) {
      chartSettingsModal.onSave();
    }
  };
  const renderIndicatorParamRows = (
    prefix: string,
    params: number[],
    paramChanged: boolean,
    onReset: () => void,
    onUpdateAt: (index: number, value: string) => void,
    options?: {
      showLabel?: boolean;
    },
  ) =>
    params.length ? (
      <>
        <div className="indicator-param-head">
          {options?.showLabel !== false ? <span className="muted">{tt('appText.indicatorConfiguration')}</span> : <span />}
          {paramChanged ? (
            <Button
              type="button"
              variant="ghost" size="xs"
              onClick={onReset}
            >
              {tt('appText.reset2')}
            </Button>
          ) : null}
        </div>
        <div className="indicator-param-list">
          {params.map((value, index) => (
            <SettingRow
              key={`${prefix}-indicator-param-${index}`}
              className="modal-settings-row indicator-param-row"
              title={ttf('appText.value0', [index + 1])}
              control={
                <Input
                  className="indicator-param-input"
                  density="compact"
                  type="number"
                  step="any"
                  value={String(value)}
                  maxLength={INPUT_LIMITS.orderInputChars}
                  onChange={(event) => onUpdateAt(index, event.target.value)}
                />
              }
            />
          ))}
        </div>
      </>
    ) : null;

  const renderIndicatorSelectControl = (input: {
    scope: ChartSettingsModalFocusTarget;
    indicator: string;
    params: number[];
    selectControl: ReactNode;
  }) => {
    const configLabel = `${input.indicator} ${tt('appText.parameterSettings')}`;
    const canConfigure =
      input.indicator !== chartSettingsModal.indicatorNoneValue &&
      input.params.length > 0;

    return (
      <div className="indicator-select-control">
        <div className="indicator-select-control-field">
          {input.selectControl}
        </div>
        <Tooltip delay={0}>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="field"
              size="icon"
              className="indicator-config-trigger"
              aria-label={configLabel}
              disabled={!canConfigure}
              onClick={() => setIndicatorConfigTarget(input.scope)}
            >
              <AppIcon name="settingsGear" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={6}>{configLabel}</TooltipContent>
        </Tooltip>
      </div>
    );
  };

  const renderIndicatorSection = (input: {
    scope: ChartSettingsModalFocusTarget;
    defaultTitle: string;
    indicator: string;
    params: number[];
    selectTitle: string;
    selectControl: ReactNode;
  }) => {
    return (
      <IndicatorPanel className="modal-section indicator-box" title={input.defaultTitle}>
        <SettingRow
          className="modal-settings-row"
          title={input.selectTitle}
          control={renderIndicatorSelectControl({
            scope: input.scope,
            indicator: input.indicator,
            params: input.params,
            selectControl: input.selectControl,
          })}
          controlFill
        />
      </IndicatorPanel>
    );
  };

  const signalIndicatorSelectGroups =
    chartSettingsModal.signalIndicatorOptions.groups.map((group) => ({
      id: group.key,
      label: group.label,
    }));
  const signalIndicatorSelectOptions = [
    {
      value: chartSettingsModal.signalIndicatorOptions.noneOption.key,
      label: chartSettingsModal.signalIndicatorOptions.noneOption.label,
    },
    ...chartSettingsModal.signalIndicatorOptions.groups.flatMap((group) =>
      group.options.map((option) => ({
        value: option.key,
        groupId: group.key,
        label: option.label,
        textValue: option.label,
      })),
    ),
  ];

  const indicatorConfigByTarget: Record<ChartSettingsModalFocusTarget, {
    scope: ChartSettingsModalFocusTarget;
    indicator: string;
    params: number[];
    paramChanged: boolean;
    onReset: () => void;
    onUpdateAt: (index: number, value: string) => void;
  }> = {
    main: {
      scope: 'main',
      indicator: chartSettingsModal.mainNativeIndicator,
      params: chartSettingsModal.mainNativeIndicatorParams,
      paramChanged: chartSettingsModal.mainIndicatorParamChanged,
      onReset: chartSettingsModal.onResetMainIndicatorParams,
      onUpdateAt: chartSettingsModal.onUpdateMainIndicatorParamAt,
    },
    top: {
      scope: 'top',
      indicator: chartSettingsModal.signalTopIndicator,
      params: chartSettingsModal.signalTopIndicatorParams,
      paramChanged: chartSettingsModal.topIndicatorParamChanged,
      onReset: chartSettingsModal.onResetTopIndicatorParams,
      onUpdateAt: chartSettingsModal.onUpdateTopIndicatorParamAt,
    },
    bottom: {
      scope: 'bottom',
      indicator: chartSettingsModal.signalBottomIndicator,
      params: chartSettingsModal.signalBottomIndicatorParams,
      paramChanged: chartSettingsModal.bottomIndicatorParamChanged,
      onReset: chartSettingsModal.onResetBottomIndicatorParams,
      onUpdateAt: chartSettingsModal.onUpdateBottomIndicatorParamAt,
    },
  };
  const activeIndicatorConfig = indicatorConfigTarget
    ? indicatorConfigByTarget[indicatorConfigTarget]
    : null;
  const showIndicatorConfigModal =
    chartSettingsModal.open &&
    activeIndicatorConfig !== null &&
    activeIndicatorConfig.indicator !== chartSettingsModal.indicatorNoneValue &&
    activeIndicatorConfig.params.length > 0;
  const indicatorConfigModalTitle =
    activeIndicatorConfig !== null
      ? `${activeIndicatorConfig.indicator} ${tt('appText.parameterSettings')}`
      : tt('appText.indicatorConfiguration');
  const indicatorLayoutMode: TrainerIndicatorSettingsLayoutMode['mode'] =
    showIndicatorConfigModal && activeIndicatorConfig ? 'parameter' : 'overview';
  const indicatorLayoutFocusedTarget =
    showIndicatorConfigModal && activeIndicatorConfig
      ? activeIndicatorConfig.scope
      : null;
  const onLayoutModeChange = chartSettingsModal.onLayoutModeChange;

  useEffect(() => {
    if (!chartSettingsModal.open) {
      return;
    }
    onLayoutModeChange?.({
      mode: indicatorLayoutMode,
      focusedTarget: indicatorLayoutFocusedTarget,
    });
  }, [
    chartSettingsModal.open,
    indicatorLayoutMode,
    indicatorLayoutFocusedTarget,
    onLayoutModeChange,
  ]);

  if (!chartSettingsModal.open) {
    return null;
  }

  if (showIndicatorConfigModal && activeIndicatorConfig) {
    return (
      <div className="chart-indicator-config-modal">
        <StandardModalFrame
          variant="alert"
          title={indicatorConfigModalTitle}
          bodyClassName="chart-indicator-config-modal-body"
          footerClassName="chart-indicator-config-modal-actions"
          actions={
            <Button
              variant={
                chartSettingsModal.focusedTarget !== null ? 'default' : 'secondary'
              }
              onClick={
                chartSettingsModal.focusedTarget !== null
                  ? completeIndicatorConfigModal
                  : closeIndicatorConfigModal
              }
              disabled={
                chartSettingsModal.focusedTarget !== null &&
                (chartSettingsModal.isSaving || chartSettingsModal.saveDisabled)
              }
            >
              {chartSettingsModal.focusedTarget !== null && chartSettingsModal.isSaving
                ? tt('appText.saving')
                : tt('appText.done')}
            </Button>
          }
        >
          <IndicatorPanel className="modal-section indicator-box indicator-config-box">
            {renderIndicatorParamRows(
              activeIndicatorConfig.scope,
              activeIndicatorConfig.params,
              activeIndicatorConfig.paramChanged,
              activeIndicatorConfig.onReset,
              activeIndicatorConfig.onUpdateAt,
              { showLabel: false },
            )}
          </IndicatorPanel>
        </StandardModalFrame>
      </div>
    );
  }

  return (
    <div className="chart-settings-modal">
      <StandardModalFrame
        variant="form"
        title={chartSettingsModalTitle}
        bodyClassName="chart-settings-modal-body"
        footerClassName="chart-settings-modal-actions"
        actions={
          <Button
            variant="default"
            onClick={chartSettingsModal.onSave}
            disabled={chartSettingsModal.isSaving || chartSettingsModal.saveDisabled}
          >
            {chartSettingsModal.isSaving ? tt('appText.saving') : tt('appText.done')}
          </Button>
        }
      >
        {renderIndicatorSection({
          scope: 'main',
          defaultTitle: tt('appText.mainChartNativeIndicators'),
          indicator: chartSettingsModal.mainNativeIndicator,
          params: chartSettingsModal.mainNativeIndicatorParams,
          selectTitle: tt('appText.mainPicture'),
          selectControl: (
            <SelectField
              className="modal-settings-select"
              density="compact"
              value={chartSettingsModal.mainNativeIndicator}
              onValueChange={(nextValue) =>
                chartSettingsModal.onMainNativeIndicatorChange(
                  nextValue,
                )
              }
              options={chartSettingsModal.mainIndicatorSelectOptions.map((option) => ({
                value: option.key,
                label: option.label,
              }))}
            />
          ),
        })}

        {renderIndicatorSection({
          scope: 'top',
          defaultTitle: tt('appText.subChart1NativeIndicators'),
          indicator: chartSettingsModal.signalTopIndicator,
          params: chartSettingsModal.signalTopIndicatorParams,
          selectTitle: tt('appText.figure1'),
          selectControl: (
            <SelectField
              className="modal-settings-select"
              density="compact"
              value={chartSettingsModal.signalTopIndicator}
              onValueChange={(nextValue) =>
                chartSettingsModal.onSignalTopIndicatorChange(
                  nextValue as SignalIndicatorName,
                )
              }
              groups={signalIndicatorSelectGroups}
              options={signalIndicatorSelectOptions}
            />
          ),
        })}

        {renderIndicatorSection({
          scope: 'bottom',
          defaultTitle: tt('appText.subChart2NativeIndicators'),
          indicator: chartSettingsModal.signalBottomIndicator,
          params: chartSettingsModal.signalBottomIndicatorParams,
          selectTitle: tt('appText.figure2'),
          selectControl: (
            <SelectField
              className="modal-settings-select"
              density="compact"
              value={chartSettingsModal.signalBottomIndicator}
              onValueChange={(nextValue) =>
                chartSettingsModal.onSignalBottomIndicatorChange(
                  nextValue as SignalIndicatorName,
                )
              }
              groups={signalIndicatorSelectGroups}
              options={signalIndicatorSelectOptions}
            />
          ),
        })}
      </StandardModalFrame>
    </div>
  );
};

export const AppTrainerModalHost = ({
  tt,
  uiText,
  shortcutModal,
}: AppTrainerModalHostProps) => {
  const shortcutSections = [
    {
      id: 'playback',
      title: uiText.shortcutGroupPlayback,
      items: [
        { id: 'next-bar', key: tt('appText.space'), label: uiText.shortcutActionNextBar },
        { id: 'auto-play', key: tt('appText.message0362'), label: uiText.shortcutActionAutoPlay },
      ],
    },
    {
      id: 'trading',
      title: uiText.shortcutGroupTrading,
      items: [
        { id: 'buy', key: tt('appText.message0360'), label: tt('appText.buy4') },
        { id: 'sell', key: tt('appText.message0361'), label: tt('appText.sell4') },
        { id: 'add-note', key: shortcutModal.addNoteKey, label: tt('appText.addNote') },
      ],
    },
    {
      id: 'drawing',
      title: uiText.shortcutGroupDrawing,
      items: shortcutModal.drawShortcutItems.map((item) => ({
        id: item.tool,
        key: item.keyDisplay,
        label: item.label,
      })),
    },
  ].filter((section) => section.items.length > 0);

  return <>
    {shortcutModal.open ? (
      <AppModal
        open={shortcutModal.open}
        onClose={shortcutModal.onClose}
        preset="alert"
        blurMask
        accessibilityTitle={uiText.shortcutTitle}
        accessibilityDescription={uiText.shortcutModalDescription}
      >
        <StandardModalFrame
          variant="alert"
          className="shortcut-modal-frame"
          bodyClassName="shortcut-modal-body"
          title={uiText.shortcutTitle}
          description={uiText.shortcutModalDescription}
          actions={
            <Button variant="secondary" onClick={shortcutModal.onClose}>
              {tt('appText.got')}
            </Button>
          }
        >
          <div className="shortcut-modal-list">
            {shortcutSections.map((section) => (
              <section
                className="shortcut-modal-section"
                data-shortcut-section={section.id}
                key={`shortcut-section-${section.id}`}
              >
                <h3 className="shortcut-modal-section-title">{section.title}</h3>
                <div className="shortcut-modal-items">
                  {section.items.map((item) => (
                    <div className="shortcut-modal-item" key={`shortcut-item-${section.id}-${item.id}`}>
                      <Keycap className="shortcut-modal-key">{item.key}</Keycap>
                      <span className="shortcut-modal-label">{item.label}</span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </StandardModalFrame>
      </AppModal>
    ) : null}

  </>;
};
