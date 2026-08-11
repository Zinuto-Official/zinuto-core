// SPDX-License-Identifier: GPL-3.0-only

import { useMemo, useState } from "react";
import type {
  DesktopBacktestDirectionSignalRule,
  DesktopBacktestSignalRuleCondition,
  DesktopBacktestSignalRuleOperand,
  DesktopBacktestSignalRuleOperator,
  DesktopBacktestSignalRules,
} from "@zinuto/shared/contracts-desktop/api";
import type { MessageId } from "@zinuto/shared/i18n";
import { VendorIcon } from "@/assets/graphics";
import { useI18n } from "@/frontend-kernel/i18n";
import { AppModal, StandardModalFrame } from "@/ui/components";
import { Button } from "@/ui/primitives/button";
import { Checkbox } from "@/ui/primitives/checkbox";
import { Input } from "@/ui/primitives/input";
import { SegmentedControl } from "@/ui/primitives/segmented-control";
import {
  SelectField,
  type SelectFieldGroup,
  type SelectFieldOption,
} from "@/ui/primitives/select-field";
import {
  createDefaultSignalRuleCondition,
  pruneSignalRules,
  STRATEGY_SIGNAL_DIRECTION_CONFIGS,
  type SignalDirection,
  type SignalRuleOutputLine,
  type StrategySignalDirectionConfig,
} from "@/workspaces/strategy-backtest/strategyBacktestSignalRuleDefaults";
import {
  formatSignalRuleSummary,
  type SignalRulePriceField,
  type SignalRuleSummaryLabels,
} from "@/workspaces/strategy-backtest/strategyBacktestSignalRuleDisplay";

type ConditionSide = "left" | "right";
type Connector = DesktopBacktestDirectionSignalRule["connector"];

type SignalRuleBuilderProps = {
  value?: DesktopBacktestSignalRules;
  outputLines: readonly SignalRuleOutputLine[];
  allowShortSelling: boolean;
  indicatorReservedKeys: readonly string[];
  isLoadingOutputs?: boolean;
  onChange: (value: DesktopBacktestSignalRules) => void;
};

type SignalRuleEditorState = {
  direction: StrategySignalDirectionConfig;
  rule: DesktopBacktestDirectionSignalRule;
};

const PRICE_FIELDS: SignalRulePriceField[] = ["CLOSE", "OPEN", "HIGH", "LOW", "VOLUME"];

const OPERATOR_KEYS: DesktopBacktestSignalRuleOperator[] = [
  "CROSS_ABOVE",
  "CROSS_BELOW",
  "GREATER",
  "GREATER_EQUAL",
  "LESS",
  "LESS_EQUAL",
  "EQUAL",
];

const createOutputOperand = (key: string): DesktopBacktestSignalRuleOperand => ({
  kind: "OUTPUT",
  key,
});

const cloneOperand = (
  operand: DesktopBacktestSignalRuleOperand,
): DesktopBacktestSignalRuleOperand => ({ ...operand });

const cloneCondition = (
  condition: DesktopBacktestSignalRuleCondition,
): DesktopBacktestSignalRuleCondition => ({
  ...condition,
  left: cloneOperand(condition.left),
  right: cloneOperand(condition.right),
});

const cloneDirectionRule = (
  rule: DesktopBacktestDirectionSignalRule,
): DesktopBacktestDirectionSignalRule => ({
  connector: rule.connector,
  conditions: rule.conditions.map(cloneCondition),
});

const encodeOperandValue = (operand: DesktopBacktestSignalRuleOperand): string => {
  switch (operand.kind) {
    case "OUTPUT":
      return `OUTPUT:${operand.key}`;
    case "PRICE":
      return `PRICE:${operand.field}`;
    case "CONSTANT":
      return "CONSTANT";
    default: {
      const exhaustive: never = operand;
      return exhaustive;
    }
  }
};

const decodeOperandValue = (
  value: string,
  previous: DesktopBacktestSignalRuleOperand,
): DesktopBacktestSignalRuleOperand => {
  if (value === "CONSTANT") {
    return {
      kind: "CONSTANT",
      value: previous.kind === "CONSTANT" ? previous.value : 0,
    };
  }
  if (value.startsWith("OUTPUT:")) {
    return createOutputOperand(value.slice("OUTPUT:".length));
  }
  if (value.startsWith("PRICE:")) {
    return {
      kind: "PRICE",
      field: value.slice("PRICE:".length) as SignalRulePriceField,
    };
  }
  return previous;
};

export const SignalRuleBuilder = ({
  value,
  outputLines,
  allowShortSelling,
  indicatorReservedKeys,
  isLoadingOutputs = false,
  onChange,
}: SignalRuleBuilderProps) => {
  const { t } = useI18n();
  const rules = value ?? {};
  const [editorState, setEditorState] = useState<SignalRuleEditorState | null>(null);
  const reservedKeys = useMemo(
    () => new Set(indicatorReservedKeys.map((key) => key.trim().toUpperCase())),
    [indicatorReservedKeys],
  );
  const hasOutputLines = outputLines.length > 0;

  const summaryLabels = useMemo<SignalRuleSummaryLabels>(
    () => ({
      connectors: {
        AND: t("trainer.strategyBacktest.signalRule.connector.and"),
        OR: t("trainer.strategyBacktest.signalRule.connector.or"),
      },
      operators: {
        CROSS_ABOVE: t("trainer.strategyBacktest.signalRule.operator.crossAbove"),
        CROSS_BELOW: t("trainer.strategyBacktest.signalRule.operator.crossBelow"),
        GREATER: t("trainer.strategyBacktest.signalRule.operator.greater"),
        GREATER_EQUAL: t("trainer.strategyBacktest.signalRule.operator.greaterEqual"),
        LESS: t("trainer.strategyBacktest.signalRule.operator.less"),
        LESS_EQUAL: t("trainer.strategyBacktest.signalRule.operator.lessEqual"),
        EQUAL: t("trainer.strategyBacktest.signalRule.operator.equal"),
      },
      prices: {
        CLOSE: t("trainer.strategyBacktest.signalRule.price.close"),
        OPEN: t("trainer.strategyBacktest.signalRule.price.open"),
        HIGH: t("trainer.strategyBacktest.signalRule.price.high"),
        LOW: t("trainer.strategyBacktest.signalRule.price.low"),
        VOLUME: t("trainer.strategyBacktest.signalRule.price.volume"),
      },
      moreConditions: (count) =>
        t("trainer.strategyBacktest.signalRule.moreConditions", { count }),
    }),
    [t],
  );

  const operandGroups = useMemo<SelectFieldGroup[]>(
    () => [
      { id: "output", label: t("trainer.strategyBacktest.signalRule.operand.output") },
      { id: "price", label: t("trainer.strategyBacktest.signalRule.operand.price") },
      { id: "constant", label: t("trainer.strategyBacktest.signalRule.operand.constant") },
    ],
    [t],
  );

  const operandOptions = useMemo<SelectFieldOption[]>(
    () => [
      ...outputLines.map((line) => ({
        value: `OUTPUT:${line.key}`,
        label: line.title && line.title !== line.key ? `${line.title} (${line.key})` : line.key,
        textValue: `${line.title} ${line.key}`,
        groupId: "output",
      })),
      ...PRICE_FIELDS.map((field) => ({
        value: `PRICE:${field}`,
        label: t(`trainer.strategyBacktest.signalRule.price.${field.toLowerCase()}` as MessageId),
        groupId: "price",
      })),
      {
        value: "CONSTANT",
        label: t("trainer.strategyBacktest.signalRule.operand.constant"),
        groupId: "constant",
      },
    ],
    [outputLines, t],
  );

  const operatorOptions = useMemo<SelectFieldOption[]>(
    () => OPERATOR_KEYS.map((operator) => ({
      value: operator,
      label: summaryLabels.operators[operator],
    })),
    [summaryLabels],
  );

  const commitDirectionRule = (
    direction: SignalDirection,
    rule: DesktopBacktestDirectionSignalRule | null,
  ) => {
    const next: DesktopBacktestSignalRules = { ...rules };
    if (rule?.conditions.length) {
      next[direction] = rule;
    } else {
      delete next[direction];
    }
    onChange(pruneSignalRules(next));
  };

  const createDefaultDirectionRule = (
    direction: StrategySignalDirectionConfig,
  ): DesktopBacktestDirectionSignalRule => ({
    connector: "AND",
    conditions: [createDefaultSignalRuleCondition(outputLines, direction)],
  });

  const openDirectionEditor = (direction: StrategySignalDirectionConfig) => {
    const existingRule = rules[direction.key];
    setEditorState({
      direction,
      rule: existingRule
        ? cloneDirectionRule(existingRule)
        : createDefaultDirectionRule(direction),
    });
  };

  const closeDirectionEditor = () => setEditorState(null);

  const saveDirectionEditor = () => {
    if (!editorState) {
      return;
    }
    commitDirectionRule(
      editorState.direction.key,
      editorState.rule.conditions.length ? editorState.rule : null,
    );
    closeDirectionEditor();
  };

  const updateDraftRule = (
    updater: (rule: DesktopBacktestDirectionSignalRule) => DesktopBacktestDirectionSignalRule,
  ) => {
    setEditorState((current) =>
      current
        ? {
          ...current,
          rule: updater(current.rule),
        }
        : current,
    );
  };

  const updateDraftCondition = (
    index: number,
    updater: (
      condition: DesktopBacktestSignalRuleCondition,
    ) => DesktopBacktestSignalRuleCondition,
  ) => {
    updateDraftRule((rule) => ({
      ...rule,
      conditions: rule.conditions.map((condition, conditionIndex) =>
        conditionIndex === index ? updater(condition) : condition,
      ),
    }));
  };

  const renderOperandControl = (
    condition: DesktopBacktestSignalRuleCondition,
    conditionIndex: number,
    side: ConditionSide,
  ) => {
    const operand = condition[side];
    return (
      <span className="strategy-signal-rule-operand">
        <SelectField
          className="strategy-backtest-select strategy-signal-rule-select"
          value={encodeOperandValue(operand)}
          onValueChange={(nextValue) =>
            updateDraftCondition(conditionIndex, (current) => ({
              ...current,
              [side]: decodeOperandValue(nextValue, current[side]),
            }))
          }
          options={operandOptions}
          groups={operandGroups}
          contentWidth="min-trigger"
        />
        {operand.kind === "CONSTANT" ? (
          <Input
            className="strategy-signal-rule-constant"
            inputMode="decimal"
            type="number"
            step="any"
            value={String(operand.value)}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (!Number.isFinite(nextValue)) {
                return;
              }
              updateDraftCondition(conditionIndex, (current) => ({
                ...current,
                [side]: { kind: "CONSTANT", value: nextValue },
              }));
            }}
          />
        ) : null}
      </span>
    );
  };

  const visibleDirections = STRATEGY_SIGNAL_DIRECTION_CONFIGS.filter(
    (direction) => allowShortSelling || !direction.requiresShortSelling,
  );
  const signalRuleDensity = visibleDirections.length <= 2 ? "expanded" : "compact";

  return (
    <section className="strategy-signal-rule-builder">
      {!hasOutputLines && !isLoadingOutputs ? (
        <div className="strategy-signal-rule-empty">
          {t("trainer.strategyBacktest.signalRule.emptyOutputs")}
        </div>
      ) : null}
      <div
        className="strategy-signal-rule-card-list"
        data-density={signalRuleDensity}
        data-layout="quadrants"
      >
        {visibleDirections.map((direction) => {
          const rule = rules[direction.key];
          const isEnabled = Boolean(rule);
          const isReserved = reservedKeys.has(direction.signalKey);
          const canEdit = hasOutputLines && !isReserved;
          const summary = rule
            ? formatSignalRuleSummary(rule, outputLines, summaryLabels)
            : null;
          const previewConditions = summary && signalRuleDensity === "expanded"
            ? summary.conditions.slice(0, 3)
            : [];
          const hiddenPreviewCount = summary
            ? Math.max(0, summary.conditionCount - previewConditions.length)
            : 0;
          const showCompactSummary = signalRuleDensity === "compact" || !summary;
          return (
            <div
              key={direction.key}
              className="strategy-signal-rule-direction"
              data-active={isEnabled ? "true" : undefined}
              data-disabled={canEdit ? undefined : "true"}
              data-density={signalRuleDensity}
            >
              <div className="strategy-signal-rule-card-main">
                <div className="strategy-signal-rule-direction-head">
                  <label className="strategy-signal-rule-enable">
                    <Checkbox
                      density="compact"
                      checked={isEnabled}
                      disabled={!canEdit}
                      onChange={(event) => {
                        if (event.currentTarget.checked) {
                          commitDirectionRule(direction.key, createDefaultDirectionRule(direction));
                        } else {
                          commitDirectionRule(direction.key, null);
                        }
                      }}
                    />
                    <span>{t(direction.labelKey)}</span>
                  </label>
                  <div className="strategy-signal-rule-head-meta">
                    {isReserved ? (
                      <span className="strategy-signal-rule-reserved">
                        {t("trainer.strategyBacktest.signalRule.reserved", {
                          signal: direction.signalKey,
                        })}
                      </span>
                    ) : null}
                    {summary ? (
                      <span className="strategy-signal-rule-meta">
                        <span className="strategy-signal-rule-chip">
                          {t("trainer.strategyBacktest.signalRule.conditionCount", {
                            count: summary.conditionCount,
                          })}
                        </span>
                        {summary.connectorLabel ? (
                          <span className="strategy-signal-rule-chip">
                            {summary.connectorLabel}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    {canEdit ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="strategy-signal-rule-edit"
                        aria-label={t("trainer.strategyBacktest.signalRule.editDirection", {
                          direction: t(direction.labelKey),
                        })}
                        title={t("trainer.strategyBacktest.signalRule.editDirection", {
                          direction: t(direction.labelKey),
                        })}
                        onClick={() => openDirectionEditor(direction)}
                      >
                        <VendorIcon name="pencil" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>
                </div>
                {showCompactSummary ? (
                  <div className="strategy-signal-rule-summary-row">
                    <span
                      className="strategy-signal-rule-summary"
                      data-empty={summary ? undefined : "true"}
                      title={summary?.title}
                    >
                      {summary?.text ?? t("trainer.strategyBacktest.signalRule.disabledSummary")}
                    </span>
                  </div>
                ) : null}
                {previewConditions.length ? (
                  <div className="strategy-signal-rule-condition-preview">
                    {previewConditions.map((condition, conditionIndex) => (
                      <span
                        key={`${direction.key}-${conditionIndex}-${condition.text}`}
                        className="strategy-signal-rule-condition-item"
                        data-has-joiner={conditionIndex > 0 && summary?.connectorLabel ? "true" : "false"}
                      >
                        {conditionIndex > 0 && summary?.connectorLabel ? (
                          <span className="strategy-signal-rule-condition-joiner">
                            {summary.connectorLabel}
                          </span>
                        ) : null}
                        <span className="strategy-signal-rule-formula-line" title={condition.text}>
                          <span className="strategy-signal-rule-condition-part">
                            {condition.left}
                          </span>
                          <span className="strategy-signal-rule-condition-operator">
                            {condition.operator}
                          </span>
                          <span className="strategy-signal-rule-condition-part">
                            {condition.right}
                          </span>
                        </span>
                      </span>
                    ))}
                    {hiddenPreviewCount > 0 ? (
                      <span className="strategy-signal-rule-condition-more">
                        {summaryLabels.moreConditions(hiddenPreviewCount)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <AppModal
        open={Boolean(editorState)}
        onClose={closeDirectionEditor}
        preset="form"
        className="strategy-signal-rule-modal"
        showCloseButton
        accessibilityTitle={
          editorState
            ? t("trainer.strategyBacktest.signalRule.editDirection", {
              direction: t(editorState.direction.labelKey),
            })
            : t("trainer.strategyBacktest.signalRule.title")
        }
      >
        {editorState ? (
          <StandardModalFrame
            variant="form"
            title={t("trainer.strategyBacktest.signalRule.editDirection", {
              direction: t(editorState.direction.labelKey),
            })}
            bodyClassName="strategy-signal-rule-modal-body"
            actions={
              <>
                <Button type="button" variant="ghost" onClick={closeDirectionEditor}>
                  {t("appText.cancel")}
                </Button>
                <Button type="button" variant="default" onClick={saveDirectionEditor}>
                  {t("trainer.strategyBacktest.signalRule.save")}
                </Button>
              </>
            }
          >
            <div className="strategy-signal-rule-modal-summary">
              <span>
                {t("trainer.strategyBacktest.signalRule.conditionCount", {
                  count: editorState.rule.conditions.length,
                })}
              </span>
              {editorState.rule.conditions.length > 1 ? (
                <SegmentedControl<Connector>
                  className="strategy-signal-rule-connector"
                  size="sm"
                  value={editorState.rule.connector}
                  onChange={(connector) =>
                    updateDraftRule((rule) => ({
                      ...rule,
                      connector,
                    }))
                  }
                  options={[
                    { value: "AND", label: summaryLabels.connectors.AND },
                    { value: "OR", label: summaryLabels.connectors.OR },
                  ]}
                  gridTemplateColumns="repeat(2, minmax(0, 1fr))"
                />
              ) : null}
            </div>
            <div className="strategy-signal-rule-conditions">
              {editorState.rule.conditions.map((condition, conditionIndex) => (
                <div
                  key={`${editorState.direction.key}-${conditionIndex}`}
                  className="strategy-signal-rule-condition"
                >
                  {renderOperandControl(condition, conditionIndex, "left")}
                  <SelectField
                    className="strategy-backtest-select strategy-signal-rule-operator"
                    value={condition.operator}
                    onValueChange={(operator) =>
                      updateDraftCondition(conditionIndex, (current) => ({
                        ...current,
                        operator: operator as DesktopBacktestSignalRuleOperator,
                      }))
                    }
                    options={operatorOptions}
                    contentWidth="min-trigger"
                  />
                  {renderOperandControl(condition, conditionIndex, "right")}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("trainer.strategyBacktest.signalRule.deleteCondition")}
                    title={t("trainer.strategyBacktest.signalRule.deleteCondition")}
                    onClick={() =>
                      updateDraftRule((rule) => ({
                        ...rule,
                        conditions: rule.conditions.filter(
                          (_condition, index) => index !== conditionIndex,
                        ),
                      }))
                    }
                  >
                    <VendorIcon name="trash2" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="strategy-signal-rule-add"
              onClick={() =>
                updateDraftRule((rule) => ({
                  ...rule,
                  conditions: [
                    ...rule.conditions,
                    createDefaultSignalRuleCondition(outputLines, editorState.direction),
                  ],
                }))
              }
            >
              <VendorIcon name="plus" aria-hidden="true" />
              <span>{t("trainer.strategyBacktest.signalRule.addCondition")}</span>
            </Button>
          </StandardModalFrame>
        ) : null}
      </AppModal>
    </section>
  );
};
