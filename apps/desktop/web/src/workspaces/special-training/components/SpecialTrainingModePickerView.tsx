// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { formatMessage } from "@zinuto/shared/i18n";
import { Button } from "@/ui/primitives/button";
import { Input } from "@/ui/primitives/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/ui/primitives/context-menu";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { AppIcon, VendorIcon } from "@/assets/graphics";
import { formatMoneyFixed } from "@/ui/formatting/format";
import { formatCountWithUnitText } from "@/ui/formatting/i18nDisplay";
import type {
  AppUiLanguage,
  getSpecialTrainingPageContent,
  SpecialTrainingModeDefinition,
  SpecialTrainingModeId,
} from "@/ui/config/uiConfig";
import { OptionStrip, PlainTabBar } from "@/ui/components";
import {
  DECISION_SECONDS_OPTIONS,
  FAST_DECISION_STRICTNESS_LEVEL_OPTIONS,
} from "@/workspaces/special-training/domain/specialTrainingConstants";
import {
  formatConfigValue,
  formatTemplate,
} from "@/workspaces/special-training/domain/specialTrainingHelpers";
import type {
  FastDecisionStrictnessOption,
  ModePickerQuestionBankStatus,
} from "@/workspaces/special-training/domain/specialTrainingTypes";
import type { ApiSpecialTrainingBank } from "@/api";
import type { SpecialTrainingBankEditorMode } from "@/workspaces/special-training/specialTrainingBankEditorModel";
import type { SpecialTrainingModeRuntimeConfig } from "@/workspaces/special-training/specialTrainingModeRegistry";
import type { ModePickerPrepGuideItem } from "@/workspaces/special-training/view-models/specialTrainingModePickerPanelsViewModel";
import type {
  ModeQuestionBankProgressItem,
  SpecialTrainingBankCardPresentation,
  SpecialTrainingBankDetailMetricEntry,
  SpecialTrainingBankDetailNoticeEntry,
} from "@/workspaces/special-training/components/specialTrainingModePickerViewTypes";
import {
  buildModePickerTabItems,
  formatBankScopeTimeframeSummary,
  resolvePrepToneClassName,
} from "@/workspaces/special-training/components/specialTrainingModePickerPresentation";

export type {
  ModeQuestionBankProgressItem,
  SpecialTrainingBankCardPresentation,
  SpecialTrainingBankDetailMetricEntry,
  SpecialTrainingBankDetailNoticeEntry,
} from "@/workspaces/special-training/components/specialTrainingModePickerViewTypes";

type SpecialTrainingPageContent = ReturnType<
  typeof getSpecialTrainingPageContent
>;
type SpecialTrainingModePickerViewProps = {
  language: AppUiLanguage;
  content: SpecialTrainingPageContent;
  activeMode: SpecialTrainingModeDefinition | undefined;
  activeModeToneClassName: string;
  availableModes: SpecialTrainingModeDefinition[];
  onActiveModeChange: (modeId: SpecialTrainingModeId) => void;
  modeQuestionBankProgressItems: ModeQuestionBankProgressItem[];
  hasEnabledSampleSymbols: boolean;
  bankSearchQuery: string;
  onBankSearchQueryChange: (value: string) => void;
  openBankEditor: (
    mode: SpecialTrainingBankEditorMode,
    bank?: ApiSpecialTrainingBank | null,
  ) => void;
  specialTrainingBanks: ApiSpecialTrainingBank[];
  filteredSpecialTrainingBanks: ApiSpecialTrainingBank[];
  hasMoreSpecialTrainingBanks: boolean;
  isLoadingMoreBanks: boolean;
  loadMoreSpecialTrainingBanks: () => Promise<void>;
  resolveBankCardPresentation: (
    bank: ApiSpecialTrainingBank,
  ) => SpecialTrainingBankCardPresentation;
  selectedBank: ApiSpecialTrainingBank | null;
  setSelectedBankId: (bankId: string) => void;
  editingBankId: string;
  editingBankName: string;
  setEditingBankName: (name: string) => void;
  saveRenameBank: () => Promise<void>;
  cancelRenameBank: () => void;
  enabledSamplePoolById: ReadonlyMap<string, unknown>;
  textSlash: string;
  formatBankTimeframeLabel: (timeframe: BaseTimeframe) => string;
  startRenameBank: (bank: ApiSpecialTrainingBank) => void;
  requestDeleteBankConfirmation: (bank: ApiSpecialTrainingBank) => void;
  requestRestartModeConfirmation: () => void;
  activeQuestionBankStatus: ModePickerQuestionBankStatus;
  selectedBankDetailMetricEntries: SpecialTrainingBankDetailMetricEntry[];
  selectedBankDetailNotices: SpecialTrainingBankDetailNoticeEntry[];
  selectedBankMissingPoolIds: string[];
  canRestartModeProgress: boolean;
  modePickerTitle: string;
  modePickerDynamicConfigTitle: string;
  prepGuideItems: ModePickerPrepGuideItem[];
  questionCountSettingHint: string;
  modePickerSegmentQuestionCountLabel: string;
  activeQuestionCount: number;
  modePickerQuestionCountOptions: readonly number[];
  updateModeRuntimeConfig: (
    modeId: SpecialTrainingModeId,
    patch: Partial<SpecialTrainingModeRuntimeConfig>,
  ) => void;
  isFastDecisionMode: boolean;
  decisionSecondsSettingHint: string;
  modePickerSegmentDecisionSecondsLabel: string;
  activeDecisionSecondsLimit: number;
  setDecisionSecondsLeft: (value: number) => void;
  horizonSettingHint: string;
  riskHorizonSettingHint: string;
  modePickerSegmentHorizonBarsLabel: string;
  activeHorizonBars: number;
  modePickerHorizonOptions: readonly number[];
  strictnessSettingHint: string;
  activeFastDecisionStrictnessLevel: SpecialTrainingModeRuntimeConfig["fastDecisionStrictnessLevel"];
  fastDecisionStrictnessOptions: FastDecisionStrictnessOption[];
  activeFastDecisionStrictnessOption: FastDecisionStrictnessOption;
  submitErrorMessage: string;
  startTrainingUnavailable: boolean;
  beginTraining: () => Promise<void>;
};

export const SpecialTrainingModePickerView = ({
  language,
  content,
  activeMode,
  activeModeToneClassName,
  availableModes,
  onActiveModeChange,
  modeQuestionBankProgressItems,
  hasEnabledSampleSymbols,
  bankSearchQuery,
  onBankSearchQueryChange,
  openBankEditor,
  specialTrainingBanks,
  filteredSpecialTrainingBanks,
  hasMoreSpecialTrainingBanks,
  isLoadingMoreBanks,
  loadMoreSpecialTrainingBanks,
  resolveBankCardPresentation,
  selectedBank,
  setSelectedBankId,
  editingBankId,
  editingBankName,
  setEditingBankName,
  saveRenameBank,
  cancelRenameBank,
  enabledSamplePoolById,
  textSlash,
  formatBankTimeframeLabel,
  startRenameBank,
  requestDeleteBankConfirmation,
  requestRestartModeConfirmation,
  activeQuestionBankStatus,
  selectedBankDetailMetricEntries,
  selectedBankDetailNotices,
  selectedBankMissingPoolIds,
  canRestartModeProgress,
  modePickerTitle,
  modePickerDynamicConfigTitle,
  prepGuideItems,
  questionCountSettingHint,
  modePickerSegmentQuestionCountLabel,
  activeQuestionCount,
  modePickerQuestionCountOptions,
  updateModeRuntimeConfig,
  isFastDecisionMode,
  decisionSecondsSettingHint,
  modePickerSegmentDecisionSecondsLabel,
  activeDecisionSecondsLimit,
  setDecisionSecondsLeft,
  horizonSettingHint,
  riskHorizonSettingHint,
  modePickerSegmentHorizonBarsLabel,
  activeHorizonBars,
  modePickerHorizonOptions,
  strictnessSettingHint,
  activeFastDecisionStrictnessLevel,
  fastDecisionStrictnessOptions,
  activeFastDecisionStrictnessOption,
  submitErrorMessage,
  startTrainingUnavailable,
  beginTraining,
}: SpecialTrainingModePickerViewProps) => {
  const modePickerTabItems = buildModePickerTabItems(availableModes);
  const activeStrictnessSummary = formatTemplate(
    content.fastDecisionStrictnessOptionTitleTemplate,
    [
      activeFastDecisionStrictnessOption.shortLabel,
      formatConfigValue(activeFastDecisionStrictnessOption.ratio, 1),
    ],
  );
  const middleDot = formatMessage(language, "appText.message0664");

  return (
    <section
      className={`special-training-stage special-training-mode-picker special-training-prep-shell ${activeModeToneClassName}`}
    >
      <section className="special-training-prep-switcher-panel">
        {activeMode ? (
          <section
            className={`special-training-prep-banner ${activeModeToneClassName}`}
            aria-label={activeMode.title}
          >
            <div className="special-training-prep-banner-inner">
              <div className="special-training-prep-banner-status-row">
                {modeQuestionBankProgressItems.length > 0 ? (
                  <div className="special-training-mode-sidebar-progress-list">
                    {modeQuestionBankProgressItems.map((item) => (
                      <span
                        key={item.modeId}
                        className={`special-training-mode-sidebar-global-status ${resolvePrepToneClassName(
                          item.tone,
                        )}`}
                      >
                        <VendorIcon
                          name={
                            item.tone === "danger"
                              ? "alertTriangle"
                              : "loaderCircle"
                          }
                          className="special-training-mode-sidebar-global-status-icon"
                          aria-hidden
                        />
                        <span>
                          {[item.title, item.label].join(` ${middleDot} `)}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="special-training-prep-banner-main">
                <PlainTabBar
                  className="special-training-prep-switcher"
                  itemClassName="special-training-prep-switcher-option"
                  value={activeMode.id}
                  items={modePickerTabItems}
                  ariaLabel={modePickerTitle}
                  onChange={onActiveModeChange}
                />
              </div>
            </div>
          </section>
        ) : null}
      </section>

      <article className="special-training-task-card special-training-prep-console">
        {activeMode ? (
          <>
            <div
              className="special-training-bank-ia-layout special-training-prep-console-animated"
              data-onboarding-target={
                isFastDecisionMode
                  ? "LIGHTNING_PREP_BANK_CONFIG"
                  : "SURVIVAL_PREP_BANK_CONFIG"
              }
            >
              <section className="special-training-prep-panel special-training-bank-workspace-panel">
                <div className="special-training-prep-panel-head">
                  <div className="special-training-prep-panel-head-copy">
                    <h5 className="special-training-prep-panel-title">
                      {formatMessage(
                        language,
                        "trainer.specialTrainingBanks.browserTitle",
                      )}
                    </h5>
                    <p className="special-training-prep-panel-summary">
                      {formatMessage(
                        language,
                        "trainer.specialTrainingBanks.browserSubtitle",
                      )}
                    </p>
                  </div>
                </div>

                <div className="special-training-bank-browser-toolbar">
                  <Input
                    value={bankSearchQuery}
                    maxLength={INPUT_LIMITS.searchQueryChars}
                    onChange={(event) =>
                      onBankSearchQueryChange(event.target.value)
                    }
                    placeholder={formatMessage(
                      language,
                      "trainer.specialTrainingBanks.searchPlaceholder",
                    )}
                    className="special-training-bank-browser-search"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => openBankEditor("CREATE", null)}
                    disabled={!hasEnabledSampleSymbols}
                  >
                    <VendorIcon name="plus" aria-hidden="true" />
                    <span>
                      {formatMessage(
                        language,
                        "trainer.specialTrainingBanks.createAction",
                      )}
                    </span>
                  </Button>
                </div>

                <div className="special-training-bank-workspace-body">
                  <div className="special-training-prep-panel-body special-training-prep-panel-body--scroll special-training-bank-browser-panel-body">
                    {!hasEnabledSampleSymbols ? (
                      <div className="special-training-bank-browser-empty">
                        <strong>
                          {formatMessage(
                            language,
                            "trainer.specialTrainingBanks.noEnabledPoolsTitle",
                          )}
                        </strong>
                        <p>{content.emptyEnabledPoolHint}</p>
                      </div>
                    ) : specialTrainingBanks.length <= 0 ? (
                      <div className="special-training-bank-browser-empty">
                        <strong>
                          {formatMessage(
                            language,
                            "trainer.specialTrainingBanks.noBanksTitle",
                          )}
                        </strong>
                        <p>
                          {formatMessage(
                            language,
                            "trainer.specialTrainingBanks.noBanksBody",
                          )}
                        </p>
                        <Button
                          type="button"
                          variant="default"
                          onClick={() => openBankEditor("CREATE", null)}
                        >
                          {formatMessage(
                            language,
                            "trainer.specialTrainingBanks.createFirstBankAction",
                          )}
                        </Button>
                      </div>
                    ) : filteredSpecialTrainingBanks.length <= 0 ? (
                      <div className="special-training-bank-browser-empty">
                        <strong>
                          {formatMessage(
                            language,
                            "trainer.specialTrainingBanks.searchEmptyTitle",
                          )}
                        </strong>
                        <p>
                          {formatMessage(
                            language,
                            "trainer.specialTrainingBanks.searchEmptyBody",
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="special-training-bank-row-list">
                        {filteredSpecialTrainingBanks.map((bank) => {
                          const card = resolveBankCardPresentation(bank);
                          const isSelected = bank.id === selectedBank?.id;
                          const isEditingBank = editingBankId === bank.id;
                          const bankMissingPoolIds = bank.scope.poolIds.filter(
                            (poolId) => !enabledSamplePoolById.has(poolId),
                          );
                          const cardSummary = card.previewState.summary;
                          const cardSourceTimeframeText = cardSummary
                            ? formatBankScopeTimeframeSummary(
                                cardSummary.sourceTimeframes,
                                cardSummary.maxSourceTimeframe ??
                                  bank.targetTimeframe,
                                formatBankTimeframeLabel,
                              )
                            : card.previewState.loading
                              ? "..."
                              : "-";
                          const cardScopeText = `${formatMoneyFixed(
                            card.poolCount,
                            0,
                          )}${textSlash}${formatMoneyFixed(
                            card.symbolCount,
                            0,
                          )}`;
                          const timeframeLabel = formatBankTimeframeLabel(
                            bank.targetTimeframe,
                          );
                          const sourceTimeframesMetaLabel = `${formatMessage(
                            language,
                            "trainer.specialTrainingBanks.sourceTimeframesLabel",
                          )} ${cardSourceTimeframeText}`;
                          const scopeMetaLabel = `${content.modePickerDatasetPoolCountLabel}${textSlash}${content.modePickerDatasetSymbolCountLabel} ${cardScopeText}`;
                          return (
                            <ContextMenu
                              key={`special-training-bank-row-${bank.id}`}
                            >
                              <ContextMenuTrigger asChild>
                                <div
                                  role="button"
                                  tabIndex={0}
                                  className={`special-training-bank-row ${
                                    isSelected ? "is-selected" : ""
                                  } ${resolvePrepToneClassName(card.status.tone)}`}
                                  onClick={() => {
                                    if (!isEditingBank) {
                                      setSelectedBankId(bank.id);
                                    }
                                  }}
                                  onContextMenu={() =>
                                    setSelectedBankId(bank.id)
                                  }
                                  onKeyDown={(event) => {
                                    if (isEditingBank) {
                                      return;
                                    }
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      setSelectedBankId(bank.id);
                                    }
                                  }}
                                  title={card.status.label}
                                >
                                  <span
                                    className="special-training-bank-row-rail"
                                    aria-hidden="true"
                                  />
                                  <div className="special-training-bank-row-content">
                                    <div className="special-training-bank-row-header">
                                      {isEditingBank ? (
                                        <Input
                                          autoFocus
                                          className="special-training-bank-row-title-input"
                                          value={editingBankName}
                                          maxLength={
                                            INPUT_LIMITS.specialTrainingBankNameChars
                                          }
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          onContextMenu={(event) =>
                                            event.stopPropagation()
                                          }
                                          onChange={(event) =>
                                            setEditingBankName(
                                              event.target.value,
                                            )
                                          }
                                          onBlur={() => {
                                            void saveRenameBank();
                                          }}
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.preventDefault();
                                              void saveRenameBank();
                                            } else if (event.key === "Escape") {
                                              event.preventDefault();
                                              cancelRenameBank();
                                            }
                                          }}
                                        />
                                      ) : (
                                        <strong className="special-training-bank-row-title">
                                          {bank.name}
                                        </strong>
                                      )}
                                    </div>
                                    <div className="special-training-bank-row-meta-line">
                                      <span
                                        className="special-training-bank-row-meta-item"
                                        title={timeframeLabel}
                                        aria-label={timeframeLabel}
                                      >
                                        <AppIcon
                                          name="statusTimer"
                                          className="special-training-bank-row-meta-icon"
                                        />
                                        <span>{timeframeLabel}</span>
                                      </span>
                                      <span
                                        className="special-training-bank-row-meta-item"
                                        title={sourceTimeframesMetaLabel}
                                        aria-label={sourceTimeframesMetaLabel}
                                      >
                                        <VendorIcon
                                          name="listChecks"
                                          className="special-training-bank-row-meta-icon"
                                          aria-hidden="true"
                                        />
                                        <span>{cardSourceTimeframeText}</span>
                                      </span>
                                      <span
                                        className="special-training-bank-row-meta-item"
                                        title={scopeMetaLabel}
                                        aria-label={scopeMetaLabel}
                                      >
                                        <AppIcon
                                          name="navData"
                                          className="special-training-bank-row-meta-icon"
                                        />
                                        <span>{cardScopeText}</span>
                                      </span>
                                    </div>
                                  </div>
                                  <span
                                    className={`special-training-bank-row-status ${resolvePrepToneClassName(
                                      card.status.tone,
                                    )}`}
                                  >
                                    <span
                                      className={`special-training-bank-row-status-dot ${resolvePrepToneClassName(
                                        card.status.tone,
                                      )}`}
                                      aria-hidden="true"
                                    />
                                    <span>{card.status.label}</span>
                                  </span>
                                </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent
                                className="special-training-bank-row-menu"
                                onCloseAutoFocus={(event) => {
                                  event.preventDefault();
                                }}
                              >
                                <ContextMenuItem
                                  onSelect={() => setSelectedBankId(bank.id)}
                                >
                                  {tt("appText.viewDetails")}
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onSelect={() => startRenameBank(bank)}
                                >
                                  {tt("appText.rename")}
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onSelect={() =>
                                    openBankEditor(
                                      bankMissingPoolIds.length > 0
                                        ? "REPAIR"
                                        : "EDIT",
                                      bank,
                                    )
                                  }
                                >
                                  {bankMissingPoolIds.length > 0
                                    ? formatMessage(
                                        language,
                                        "trainer.specialTrainingBanks.repairAction",
                                      )
                                    : formatMessage(
                                        language,
                                        "trainer.specialTrainingBanks.editAction",
                                      )}
                                </ContextMenuItem>
                                <ContextMenuItem
                                  onSelect={() => openBankEditor("COPY", bank)}
                                >
                                  {formatMessage(
                                    language,
                                    "trainer.specialTrainingBanks.copyAction",
                                  )}
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem
                                  className="is-danger"
                                  onSelect={() => {
                                    setSelectedBankId(bank.id);
                                    requestDeleteBankConfirmation(bank);
                                  }}
                                >
                                  {formatMessage(
                                    language,
                                    "trainer.specialTrainingBanks.deleteAction",
                                  )}
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        })}
                        {hasMoreSpecialTrainingBanks ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="special-training-bank-browser-load-more"
                            disabled={isLoadingMoreBanks}
                            onClick={() => {
                              void loadMoreSpecialTrainingBanks();
                            }}
                          >
                            {isLoadingMoreBanks
                              ? formatMessage(language, "appText.loading")
                              : formatMessage(language, "appText.loadMore")}
                          </Button>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="special-training-bank-summary-panel-body">
                    {selectedBank ? (
                      <>
                        <div className="special-training-bank-detail-block">
                          <div className="special-training-bank-detail-summary">
                            <div className="special-training-bank-detail-summary-main">
                              <div className="special-training-bank-detail-summary-title-row">
                                <strong className="special-training-bank-detail-summary-title">
                                  {selectedBank.name}
                                </strong>
                              </div>
                            </div>
                            <div className="special-training-bank-detail-summary-actions">
                              <span
                                className={`special-training-prep-status-badge ${resolvePrepToneClassName(
                                  activeQuestionBankStatus.tone,
                                )}`}
                              >
                                <span>{activeQuestionBankStatus.label}</span>
                              </span>
                              {canRestartModeProgress ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="special-training-bank-detail-action"
                                  onClick={requestRestartModeConfirmation}
                                >
                                  {activeQuestionBankStatus.tone === "danger"
                                    ? content.questionBankRebuildButtonLabel
                                    : formatMessage(
                                        language,
                                        "trainer.questionBank.resetAction",
                                      )}
                                </Button>
                              ) : null}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="special-training-bank-detail-action is-danger"
                                onClick={() =>
                                  requestDeleteBankConfirmation(selectedBank)
                                }
                              >
                                {formatMessage(
                                  language,
                                  "trainer.specialTrainingBanks.deleteAction",
                                )}
                              </Button>
                            </div>
                          </div>

                          <div className="special-training-bank-detail-grid">
                            {selectedBankDetailMetricEntries.map((entry) => (
                              <article
                                key={`special-training-bank-detail-metric-${entry.key}`}
                                className={`special-training-bank-detail-metric ${resolvePrepToneClassName(
                                  entry.tone,
                                )}`}
                              >
                                <small>{entry.label}</small>
                                <strong>{entry.value}</strong>
                              </article>
                            ))}
                          </div>

                          {selectedBankDetailNotices.length > 0 ? (
                            <div className="special-training-bank-detail-note-list">
                              {selectedBankDetailNotices.map((entry) => (
                                <div
                                  key={`special-training-bank-detail-note-${entry.key}`}
                                  className={`special-training-bank-detail-note ${resolvePrepToneClassName(
                                    entry.tone,
                                  )}`}
                                >
                                  {entry.text}
                                </div>
                              ))}
                            </div>
                          ) : null}

                          <div className="special-training-bank-detail-actions">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="special-training-bank-detail-action"
                              onClick={() =>
                                openBankEditor(
                                  selectedBankMissingPoolIds.length > 0
                                    ? "REPAIR"
                                    : "EDIT",
                                  selectedBank,
                                )
                              }
                            >
                              {selectedBankMissingPoolIds.length > 0
                                ? formatMessage(
                                    language,
                                    "trainer.specialTrainingBanks.repairAction",
                                  )
                                : formatMessage(
                                    language,
                                    "trainer.specialTrainingBanks.editAction",
                                  )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="special-training-bank-detail-action"
                              onClick={() =>
                                openBankEditor("COPY", selectedBank)
                              }
                            >
                              {formatMessage(
                                language,
                                "trainer.specialTrainingBanks.copyAction",
                              )}
                            </Button>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                </div>
              </section>

              <aside className="special-training-bank-launch-column">
                <section
                  className="special-training-prep-panel special-training-prep-launch-panel"
                  aria-label={activeMode.switcherSubtitle}
                >
                  <div className="special-training-prep-panel-head">
                    <div className="special-training-prep-panel-head-copy">
                      <h5 className="special-training-prep-panel-title">
                        {activeMode.switcherSubtitle}
                      </h5>
                    </div>
                  </div>

                  <div className="special-training-prep-panel-body special-training-prep-panel-body--scroll special-training-prep-start-panel-body">
                    <section className="special-training-prep-start-section">
                      <span className="special-training-prep-start-section-label">
                        {modePickerDynamicConfigTitle}
                      </span>
                      <div className="special-training-prep-setting-stack">
                        <div
                          className="special-training-prep-segment-group"
                          title={questionCountSettingHint}
                        >
                          <span className="special-training-prep-segment-label">
                            {modePickerSegmentQuestionCountLabel}
                          </span>
                          <OptionStrip
                            className="special-training-prep-option-strip"
                            buttonClassName="special-training-prep-option-btn"
                            value={activeQuestionCount}
                            options={modePickerQuestionCountOptions.map(
                              (value) => ({
                                value,
                                label: formatCountWithUnitText(
                                  language,
                                  value,
                                  content.modePickerQuestionUnitLabel,
                                ),
                              }),
                            )}
                            onChange={(value) =>
                              updateModeRuntimeConfig(activeMode.id, {
                                questionCount: value,
                              })
                            }
                          />
                        </div>

                        {isFastDecisionMode ? (
                          <div
                            className="special-training-prep-segment-group"
                            title={decisionSecondsSettingHint}
                          >
                            <span className="special-training-prep-segment-label">
                              {modePickerSegmentDecisionSecondsLabel}
                            </span>
                            <OptionStrip
                              className="special-training-prep-option-strip"
                              buttonClassName="special-training-prep-option-btn"
                              value={activeDecisionSecondsLimit}
                              options={DECISION_SECONDS_OPTIONS.map(
                                (value) => ({
                                  value,
                                  label: formatCountWithUnitText(
                                    language,
                                    value,
                                    content.modePickerSecondUnitLabel,
                                  ),
                                }),
                              )}
                              onChange={(value) => {
                                updateModeRuntimeConfig(activeMode.id, {
                                  decisionSecondsLimit: value,
                                });
                                setDecisionSecondsLeft(value);
                              }}
                            />
                          </div>
                        ) : null}

                        <div
                          className="special-training-prep-segment-group"
                          title={
                            isFastDecisionMode
                              ? horizonSettingHint
                              : riskHorizonSettingHint
                          }
                        >
                          <span className="special-training-prep-segment-label">
                            {modePickerSegmentHorizonBarsLabel}
                          </span>
                          <OptionStrip
                            className="special-training-prep-option-strip"
                            buttonClassName="special-training-prep-option-btn"
                            value={activeHorizonBars}
                            options={modePickerHorizonOptions.map((value) => ({
                              value,
                              label: formatCountWithUnitText(
                                language,
                                value,
                                content.modePickerBarsUnitLabel,
                              ),
                            }))}
                            onChange={(value) =>
                              updateModeRuntimeConfig(activeMode.id, {
                                horizonBars: value,
                              })
                            }
                          />
                        </div>

                        {isFastDecisionMode ? (
                          <div
                            className="special-training-prep-segment-group special-training-prep-segment-group-strictness"
                            title={strictnessSettingHint}
                          >
                            <span className="special-training-prep-segment-label">
                              {content.fastDecisionStrictnessLabel}
                            </span>
                            <OptionStrip
                              className="special-training-prep-option-strip special-training-prep-option-strip-strictness"
                              buttonClassName="special-training-prep-option-btn"
                              value={activeFastDecisionStrictnessLevel}
                              options={FAST_DECISION_STRICTNESS_LEVEL_OPTIONS.map(
                                (level) => {
                                  const option =
                                    fastDecisionStrictnessOptions.find(
                                      (item) => item.level === level,
                                    ) ?? activeFastDecisionStrictnessOption;
                                  return {
                                    value: level,
                                    label: option.shortLabel,
                                  };
                                },
                              )}
                              onChange={(level) =>
                                updateModeRuntimeConfig(activeMode.id, {
                                  fastDecisionStrictnessLevel: level,
                                })
                              }
                            />
                            <p className="special-training-prep-strictness-copy">
                              <strong>{activeStrictnessSummary}</strong>
                              <span>
                                {activeFastDecisionStrictnessOption.subtitle}
                              </span>
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </section>

                    {prepGuideItems.length > 0 ? (
                      <section className="special-training-prep-start-section special-training-prep-start-section--guide">
                        <span className="special-training-prep-start-section-label">
                          {content.prepGuideTitle}
                        </span>
                        <div className="special-training-prep-guide-list">
                          {prepGuideItems.map((item, index) => (
                            <article
                              key={`special-training-prep-guide-${item.key}`}
                              className="special-training-prep-guide-item"
                            >
                              <span
                                className="special-training-prep-guide-index"
                                aria-hidden="true"
                              >
                                {index + 1}
                              </span>
                              <div className="special-training-prep-guide-copy">
                                <strong>{item.label}</strong>
                                <p>{item.value}</p>
                              </div>
                            </article>
                          ))}
                        </div>
                      </section>
                    ) : null}
                  </div>

                  <div className="special-training-prep-start-panel-footer">
                    {submitErrorMessage ? (
                      <p className="special-training-inline-hint">
                        {submitErrorMessage}
                      </p>
                    ) : null}
                    <div className="special-training-prep-start-actions">
                      <Button
                        variant={
                          startTrainingUnavailable ? "secondary" : "default"
                        }
                        className={`special-training-prep-action-main ${activeModeToneClassName} ${
                          startTrainingUnavailable ? "is-disabled" : ""
                        }`}
                        onClick={() => void beginTraining()}
                        disabled={startTrainingUnavailable}
                      >
                        {content.trainingStartLabel}
                      </Button>
                    </div>
                  </div>
                </section>
              </aside>
            </div>
          </>
        ) : null}
      </article>
    </section>
  );
};
