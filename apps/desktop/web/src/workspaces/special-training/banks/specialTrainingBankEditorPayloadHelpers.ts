// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { formatMessage } from "@zinuto/shared/i18n";
import { formatMoneyFixed } from "@/ui/formatting/format";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type { SpecialTrainingBankEditorWindowPayload } from "@/workspaces/special-training/SpecialTrainingBankEditorDrawer";
import {
  SPECIAL_TRAINING_BANK_EDITOR_STEPS,
  type SpecialTrainingBankEditorDraft,
  type SpecialTrainingBankEditorMode,
  type SpecialTrainingBankEditorStep,
} from "@/workspaces/special-training/specialTrainingBankEditorModel";
import type {
  SpecialTrainingBankEditorBlockedReasonCode,
  SpecialTrainingBankEditorPoolReadiness,
  SpecialTrainingBankEditorReadModel,
} from "@/workspaces/special-training/banks/specialTrainingBankEditorReadModel";
import { formatQuestionBankTimeframeSummary } from "@/workspaces/special-training/session/questionBankRuntimeCore";
import type {
  BankCardPreviewState,
  NormalizedEnabledSamplePool,
  SpecialTrainingPageContent,
} from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";

export const resolveBankEditorPoolOptions = ({
  availablePools,
  draft,
  selectedPoolIds,
  poolReadinessById,
  formatBankTimeframeLabel,
  language,
}: {
  availablePools: NormalizedEnabledSamplePool[];
  draft: SpecialTrainingBankEditorDraft | null;
  selectedPoolIds: string[];
  poolReadinessById: ReadonlyMap<string, SpecialTrainingBankEditorPoolReadiness>;
  formatBankTimeframeLabel: (
    timeframe: BaseTimeframe | null | undefined,
  ) => string;
  language: AppUiLanguage;
}) =>
  availablePools.map((pool) => {
    const disabledReasonCode =
      poolReadinessById.get(pool.id)?.reasonCode ?? null;
    return {
      id: pool.id,
      name: pool.name,
      sourceTimeframeLabel: formatBankTimeframeLabel(pool.baseTimeframe),
      symbolCountText: formatMoneyFixed(pool.symbols.length, 0),
      selected: selectedPoolIds.includes(pool.id),
      disabled: disabledReasonCode !== null,
      disabledReason:
        disabledReasonCode === "TARGET_TIMEFRAME_TOO_LOW"
          ? formatMessage(
              language,
              "trainer.specialTrainingBanks.editorPoolDisabledByTimeframe",
              {
                poolTimeframe: formatBankTimeframeLabel(pool.baseTimeframe),
                targetTimeframe: formatBankTimeframeLabel(
                  draft?.targetTimeframe ?? "1d",
                ),
              },
            )
          : disabledReasonCode === "NO_SYMBOLS"
            ? formatMessage(
                language,
                "trainer.specialTrainingBanks.editorPoolDisabledNoSymbols",
              )
            : disabledReasonCode === "NO_INSTRUMENTS"
              ? formatMessage(
                  language,
                  "trainer.specialTrainingBanks.editorPoolDisabledNoInstruments",
                )
              : disabledReasonCode === "POOL_REPAIR_REQUIRED"
                ? formatMessage(
                    language,
                    "trainer.specialTrainingBanks.editorPoolsSelectionRepairRequired",
                  )
                : null,
    };
  });

export const readBankEditorSelectionBadge = ({
  missingPoolCount,
  selectedPoolCount,
  isPoolsValid,
  language,
}: {
  missingPoolCount: number;
  selectedPoolCount: number;
  isPoolsValid: boolean;
  language: AppUiLanguage;
}) => {
  if (missingPoolCount > 0) {
    return {
      tone: "warning" as const,
      label: formatMessage(
        language,
        "trainer.specialTrainingBanks.editorPoolsSelectionRepairRequired",
      ),
    };
  }
  if (isPoolsValid) {
    return {
      tone: "ready" as const,
      label: formatMessage(
        language,
        "trainer.specialTrainingBanks.editorPoolsSelectionReady",
        {
          count: selectedPoolCount,
        },
      ),
    };
  }
  return {
    tone: "warning" as const,
    label: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPoolsSelectionRequired",
    ),
  };
};

export const resolveBankEditorPrimaryActionHint = ({
  blockReason,
  previewErrorMessage,
  previewBlockedReason,
  language,
}: {
  blockReason: SpecialTrainingBankEditorBlockedReasonCode | null;
  previewErrorMessage: string;
  previewBlockedReason?: string | null;
  language: AppUiLanguage;
}) => {
  switch (blockReason) {
    case "NAME_REQUIRED":
      return formatMessage(
        language,
        "trainer.specialTrainingBanks.editorNameRequiredHint",
      );
    case "POOL_SELECTION_REQUIRED":
    case "POOL_REPAIR_REQUIRED":
      return null;
    case "SYMBOLS_REQUIRED":
    case "TARGET_TIMEFRAME_INVALID":
      return previewErrorMessage || previewBlockedReason || null;
    default:
      return null;
  }
};

export const createBankEditorWindowPayload = ({
  isOpen,
  language,
  bankEditorMode,
  bankEditorDraft,
  bankEditorStep,
  bankEditorSelectionStatus,
  bankEditorAutoRemovedNotice,
  bankEditorPreviewState,
  bankEditorPoolOptions,
  bankEditorTimeframeOptions,
  bankEditorMissingPoolIds,
  bankEditorStepIndex,
  bankEditorReadModel,
  bankEditorPrimaryActionHint,
  formatBankTimeframeLabel,
  joinWithMiddleDot,
}: {
  isOpen: boolean;
  language: AppUiLanguage;
  content: SpecialTrainingPageContent;
  bankEditorMode: SpecialTrainingBankEditorMode;
  bankEditorDraft: SpecialTrainingBankEditorDraft | null;
  bankEditorStep: SpecialTrainingBankEditorStep;
  bankEditorSelectionStatus: {
    label: string;
    tone: "ready" | "warning";
  };
  bankEditorAutoRemovedNotice: string;
  bankEditorPreviewState: BankCardPreviewState;
  bankEditorPoolOptions: ReturnType<typeof resolveBankEditorPoolOptions>;
  bankEditorTimeframeOptions: Array<{
    value: BaseTimeframe;
    label: string;
  }>;
  bankEditorMissingPoolIds: string[];
  bankEditorStepIndex: number;
  bankEditorReadModel: SpecialTrainingBankEditorReadModel;
  bankEditorPrimaryActionHint: string | null;
  formatBankTimeframeLabel: (
    timeframe: BaseTimeframe | null | undefined,
  ) => string;
  joinWithMiddleDot: (parts: ReadonlyArray<string>) => string;
}): SpecialTrainingBankEditorWindowPayload | null => {
  if (!isOpen) {
    return null;
  }
  return {
    title: formatMessage(
      language,
      bankEditorMode === "CREATE"
        ? "trainer.specialTrainingBanks.editorCreateTitle"
        : bankEditorMode === "COPY"
          ? "trainer.specialTrainingBanks.editorCopyTitle"
          : bankEditorMode === "REPAIR"
            ? "trainer.specialTrainingBanks.editorRepairTitle"
            : "trainer.specialTrainingBanks.editorEditTitle",
    ),
    description: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorDescription",
    ),
    cancelLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.cancelAction",
    ),
    backLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorBackAction",
    ),
    nextLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorNextAction",
    ),
    saveLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorSaveAction",
    ),
    draft:
      bankEditorDraft ?? {
        sourceBankId: null,
        name: "",
        poolIds: [],
        targetTimeframe: "1d",
      },
    steps: SPECIAL_TRAINING_BANK_EDITOR_STEPS.map((stepId) => ({
      id: stepId,
      label: formatMessage(
        language,
        stepId === "CONFIG"
          ? "trainer.specialTrainingBanks.editorStepConfig"
          : "trainer.specialTrainingBanks.editorStepPreview",
      ),
    })),
    step: bankEditorStep,
    configTitle: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorStepConfig",
    ),
    configHint: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorConfigHint",
    ),
    nameLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.nameLabel",
    ),
    poolsLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPoolsTitle",
    ),
    poolsHint: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPoolsHint",
    ),
    poolsEmptyLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPoolsEmpty",
    ),
    missingPoolsLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorMissingPoolsLabel",
    ),
    timeframeLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorTimeframeTitle",
    ),
    timeframeHint: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorTimeframeHint",
    ),
    sourceTimeframeLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPoolSourceTimeframeLabel",
    ),
    symbolCountLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.symbolCountLabel",
    ),
    selectionStatusLabel: bankEditorSelectionStatus.label,
    selectionStatusTone: bankEditorSelectionStatus.tone,
    autoRemovedNotice: bankEditorAutoRemovedNotice || null,
    previewTitle: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPreviewTitle",
    ),
    previewSubtitle: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPreviewSubtitle",
    ),
    previewLoadingLabel: formatMessage(
      language,
      "trainer.specialTrainingBanks.editorPreviewLoading",
    ),
    previewLoading: bankEditorPreviewState.loading,
    previewErrorLabel: bankEditorPreviewState.errorMessage || null,
    previewSummaryLines: bankEditorPreviewState.summary
      ? [
          `${formatMessage(
            language,
            "trainer.specialTrainingBanks.nameLabel",
          )} ${bankEditorDraft?.name ?? ""}`,
          `${formatMessage(
            language,
            "trainer.specialTrainingBanks.editorTimeframeTitle",
          )} ${formatBankTimeframeLabel(
            bankEditorDraft?.targetTimeframe ?? "1d",
          )}`,
          joinWithMiddleDot([
            `${formatMoneyFixed(
              bankEditorPreviewState.summary.poolCount,
              0,
            )} ${formatMessage(
              language,
              "trainer.specialTrainingBanks.poolCountLabel",
            )}`,
            `${formatMoneyFixed(
              bankEditorPreviewState.summary.symbolCount,
              0,
            )} ${formatMessage(
              language,
              "trainer.specialTrainingBanks.symbolCountLabel",
            )}`,
          ]),
          joinWithMiddleDot([
            `${formatMessage(
              language,
              "trainer.specialTrainingBanks.sourceTimeframesLabel",
            )} ${formatQuestionBankTimeframeSummary(
              bankEditorPreviewState.summary.sourceTimeframes,
              bankEditorPreviewState.summary.maxSourceTimeframe ??
                bankEditorDraft?.targetTimeframe ??
                "1d",
              formatBankTimeframeLabel,
            )}`,
            bankEditorPreviewState.summary.status === "READY"
              ? formatMessage(
                  language,
                  "trainer.specialTrainingBanks.statusReady",
                )
              : formatMessage(
                  language,
                  "trainer.specialTrainingBanks.statusRepair",
                ),
          ]),
        ]
      : [],
    previewMetrics: [],
    availablePoolOptions: bankEditorPoolOptions,
    timeframeOptions: bankEditorTimeframeOptions,
    missingPoolIds: bankEditorMissingPoolIds,
    canGoBack: bankEditorStepIndex > 0,
    canSave: bankEditorStep === "PREVIEW",
    nextDisabled: !bankEditorReadModel.readiness.current.enabled,
    saveDisabled: !bankEditorReadModel.readiness.preview.enabled,
    primaryActionHint: bankEditorPrimaryActionHint,
  };
};
