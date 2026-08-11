// SPDX-License-Identifier: GPL-3.0-only
import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/api";
import type { ApiSpecialTrainingBank } from "@/api";
import { formatMessage } from "@zinuto/shared/i18n";
import type { SpecialTrainingBankEditorWindowPayload } from "@/workspaces/special-training/SpecialTrainingBankEditorDrawer";
import {
  createSpecialTrainingBank,
  deleteSpecialTrainingBank,
  updateSpecialTrainingBank,
} from "@/workspaces/special-training/services/specialTrainingApiService";
import {
  SPECIAL_TRAINING_BANK_EDITOR_STEPS,
  normalizeSpecialTrainingBankEditorName,
  resolveSpecialTrainingBankDefaultName,
  type SpecialTrainingBankEditorDraft,
  type SpecialTrainingBankEditorMode,
  type SpecialTrainingBankEditorStep,
} from "@/workspaces/special-training/specialTrainingBankEditorModel";
import {
  DEFAULT_MODE_RUNTIME_CONFIG_BY_ID,
  SPECIAL_TRAINING_MODE_IDS,
  createModeSelectedPoolIdsMap,
} from "@/workspaces/special-training/specialTrainingModeRegistry";
import {
  SPECIAL_TRAINING_BANK_TIMEFRAME_OPTIONS,
  createEmptyBankCardPreviewState,
  type UseSpecialTrainingBankManagerOptions,
} from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";
import {
  canLoadMoreSpecialTrainingBanks,
  resolveAssetClassForPoolIds,
  resolvePoolsByIds,
  resolveSymbolsFromPools,
} from "@/workspaces/special-training/banks/specialTrainingBankPoolHelpers";
import {
  createBankEditorWindowPayload,
  resolveBankEditorPoolOptions,
  resolveBankEditorPrimaryActionHint,
  readBankEditorSelectionBadge,
} from "@/workspaces/special-training/banks/specialTrainingBankEditorPayloadHelpers";
import { createSpecialTrainingBankEditorPoolReadinessMap } from "@/workspaces/special-training/banks/specialTrainingBankEditorReadModel";
import { readSpecialTrainingBankDeleteConfirmActionPayload } from "@/workspaces/special-training/specialTrainingBankDeleteConfirmWindow";
import {
  useSpecialTrainingBankCardPreviews,
  useSpecialTrainingBankEditorReadModel,
} from "@/workspaces/special-training/banks/specialTrainingBankPreviewRuntime";
import { resolveSpecialTrainingBankCardPresentation } from "@/workspaces/special-training/banks/specialTrainingBankCardPresentation";
import { useSpecialTrainingBankListRuntime } from "@/workspaces/special-training/banks/specialTrainingBankListRuntime";
import {
  EMPTY_BANK_EDITOR_SELECTED_POOL_IDS,
  isBankEditorStepActionValue,
  isBankEditorTimeframeActionValue,
  isExpectedDesktopSecondaryWindowUnavailableError,
  readActionPayloadObject,
} from "@/workspaces/special-training/banks/specialTrainingBankEditorActionValues";
import { useSpecialTrainingBankManagerInputs } from "@/workspaces/special-training/banks/useSpecialTrainingBankManagerInputs";
import { useFilteredSpecialTrainingBanks } from "@/workspaces/special-training/banks/useFilteredSpecialTrainingBanks";

export const useSpecialTrainingBankManager = ({
  language,
  content,
  enabledSamplePoolSymbols,
  enabledSamplePools,
  globalResetRevision,
  setSubmitErrorMessage,
  setModeRuntimeConfigById,
}: UseSpecialTrainingBankManagerOptions) => {
  const {
    bankListFallbackErrorMessage,
    defaultCreateBankTargetTimeframe,
    defaultSelectedPoolIds,
    enabledSamplePoolRevision,
    enabledSamplePoolById,
    formatBankTimeframeLabel,
    hasEnabledSampleSymbols,
    joinWithMiddleDot,
    normalizedEnabledSamplePools,
    resolveBankApiErrorMessage,
  } = useSpecialTrainingBankManagerInputs({
    language,
    enabledSamplePoolSymbols,
    enabledSamplePools,
  });
  const [selectedPoolIds, setSelectedPoolIds] = useState<string[]>(() => [
    ...defaultSelectedPoolIds,
  ]);
  const [specialTrainingBanks, setSpecialTrainingBanks] = useState<
    ApiSpecialTrainingBank[]
  >([]);
  const [bankListNextCursor, setBankListNextCursor] = useState<string | null>(
    null,
  );
  const [bankListTotal, setBankListTotal] = useState(0);
  const [isLoadingMoreBanks, setIsLoadingMoreBanks] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [editingBankId, setEditingBankId] = useState("");
  const [editingBankName, setEditingBankName] = useState("");
  const [isBankEditorOpen, setIsBankEditorOpen] = useState(false);
  const [bankEditorMode, setBankEditorMode] =
    useState<SpecialTrainingBankEditorMode>("CREATE");
  const [bankEditorStep, setBankEditorStep] =
    useState<SpecialTrainingBankEditorStep>("CONFIG");
  const [bankEditorDraft, setBankEditorDraft] =
    useState<SpecialTrainingBankEditorDraft | null>(null);
  const [bankEditorAutoRemovedNotice, setBankEditorAutoRemovedNotice] =
    useState("");
  const globalResetRevisionRef = useRef(globalResetRevision);
  const enabledSamplePoolRevisionRef = useRef(enabledSamplePoolRevision);
  const bankEditorWindowOpenedRef = useRef(false);
  const bankEditorWindowRevisionRef = useRef<number | null>(null);

  const { refreshSpecialTrainingBanks } = useSpecialTrainingBankListRuntime({
    bankSearchQuery,
    dataLoadFailedLabel: content.dataLoadFailedLabel,
    fallbackErrorMessage: bankListFallbackErrorMessage,
    resolveApiErrorMessage: resolveBankApiErrorMessage,
    setSubmitErrorMessage,
    setBanks: setSpecialTrainingBanks,
    setNextCursor: setBankListNextCursor,
    setTotal: setBankListTotal,
    setIsLoadingMore: setIsLoadingMoreBanks,
  });

  useEffect(() => {
    if (globalResetRevisionRef.current !== globalResetRevision) {
      globalResetRevisionRef.current = globalResetRevision;
      setSpecialTrainingBanks([]);
      setBankListNextCursor(null);
      setBankListTotal(0);
      setIsLoadingMoreBanks(false);
      setSelectedBankId("");
      setBankSearchQuery("");
      setEditingBankId("");
      setEditingBankName("");
      setIsBankEditorOpen(false);
      setBankEditorStep("CONFIG");
      setBankEditorDraft(null);
      setBankEditorAutoRemovedNotice("");
      void api
        .closeDesktopSecondaryWindow("SPECIAL_TRAINING_BANK_DELETE_CONFIRM")
        .catch(() => undefined);
      void api
        .closeDesktopSecondaryWindow("SPECIAL_TRAINING_BANK_EDITOR")
        .catch(() => undefined);
    }
    void refreshSpecialTrainingBanks();
  }, [globalResetRevision, refreshSpecialTrainingBanks]);

  useEffect(() => {
    if (enabledSamplePoolRevisionRef.current === enabledSamplePoolRevision) {
      return;
    }
    enabledSamplePoolRevisionRef.current = enabledSamplePoolRevision;
    // The bank summary is a snapshot of the pool scope. Do not retain that
    // snapshot while either source eligibility or its content revision changed.
    setSpecialTrainingBanks([]);
    setBankListNextCursor(null);
    setBankListTotal(0);
    setIsLoadingMoreBanks(false);
    void refreshSpecialTrainingBanks();
  }, [enabledSamplePoolRevision, refreshSpecialTrainingBanks]);

  const loadMoreSpecialTrainingBanks = useCallback(async () => {
    const cursor = bankListNextCursor;
    if (
      !canLoadMoreSpecialTrainingBanks({
        nextCursor: cursor,
        isLoadingMoreBanks,
      })
    ) {
      return;
    }
    await refreshSpecialTrainingBanks({ append: true, cursor });
  }, [bankListNextCursor, isLoadingMoreBanks, refreshSpecialTrainingBanks]);

  useEffect(() => {
    if (!specialTrainingBanks.length) {
      setSelectedBankId("");
      return;
    }
    if (
      selectedBankId &&
      specialTrainingBanks.some((bank) => bank.id === selectedBankId)
    ) {
      return;
    }
    setSelectedBankId(specialTrainingBanks[0]?.id ?? "");
  }, [selectedBankId, specialTrainingBanks]);

  const selectedBank = useMemo(
    () =>
      specialTrainingBanks.find((bank) => bank.id === selectedBankId) ??
      specialTrainingBanks[0] ??
      null,
    [selectedBankId, specialTrainingBanks],
  );
  const upsertSpecialTrainingBank = useCallback(
    (bank: ApiSpecialTrainingBank) => {
      setSpecialTrainingBanks((current) => {
        const existingIndex = current.findIndex((item) => item.id === bank.id);
        if (existingIndex < 0) {
          return [bank, ...current];
        }
        const next = [...current];
        next[existingIndex] = bank;
        return next;
      });
    },
    [],
  );
  const specialTrainingBankNames = useMemo(
    () => specialTrainingBanks.map((bank) => String(bank.name || "").trim()),
    [specialTrainingBanks],
  );

  const openBankEditor = useCallback(
    (
      mode: SpecialTrainingBankEditorMode,
      bank?: ApiSpecialTrainingBank | null,
    ) => {
      const normalizedPoolIds =
        mode === "CREATE" ? [] : [...(bank?.scope.poolIds ?? [])];
      const nextDraft: SpecialTrainingBankEditorDraft = {
        sourceBankId:
          mode === "CREATE" ? null : String(bank?.id || "").trim() || null,
        name:
          mode === "CREATE"
            ? resolveSpecialTrainingBankDefaultName({
                language,
                existingNames: specialTrainingBankNames,
              })
            : mode === "COPY"
              ? normalizeSpecialTrainingBankEditorName(
                  `${String(bank?.name || "").trim()} ${formatMessage(
                    language,
                    "trainer.specialTrainingBanks.copySuffix",
                  )}`,
                )
              : normalizeSpecialTrainingBankEditorName(
                  String(bank?.name || "").trim(),
                ),
        poolIds: [...normalizedPoolIds],
        targetTimeframe:
          bank?.targetTimeframe ?? defaultCreateBankTargetTimeframe ?? "1d",
      };
      setBankEditorMode(mode);
      setBankEditorDraft(nextDraft);
      setBankEditorStep("CONFIG");
      setBankEditorAutoRemovedNotice("");
      setIsBankEditorOpen(true);
    },
    [defaultCreateBankTargetTimeframe, language, specialTrainingBankNames],
  );
  const closeBankEditor = useCallback(() => {
    setIsBankEditorOpen(false);
    setBankEditorAutoRemovedNotice("");
  }, []);
  const startRenameBank = useCallback((bank: ApiSpecialTrainingBank) => {
    const bankId = String(bank.id || "").trim();
    if (!bankId) {
      return;
    }
    setSelectedBankId(bankId);
    setEditingBankId(bankId);
    setEditingBankName(String(bank.name || "").trim());
  }, []);
  const cancelRenameBank = useCallback(() => {
    setEditingBankId("");
    setEditingBankName("");
  }, []);
  const saveRenameBank = useCallback(async () => {
    const bankId = String(editingBankId || "").trim();
    if (!bankId) {
      return;
    }
    const bank = specialTrainingBanks.find((item) => item.id === bankId);
    const nextName = normalizeSpecialTrainingBankEditorName(editingBankName);
    if (!bank || !nextName) {
      cancelRenameBank();
      return;
    }
    if (nextName === bank.name) {
      cancelRenameBank();
      return;
    }
    setSubmitErrorMessage("");
    try {
      const savedBank = await updateSpecialTrainingBank(bank.id, {
        name: nextName,
        assetClass: bank.assetClass,
        targetTimeframe: bank.targetTimeframe,
        poolIds: [...bank.scope.poolIds],
      });
      upsertSpecialTrainingBank(savedBank);
      setSelectedBankId(savedBank.id);
      cancelRenameBank();
    } catch (error) {
      setSubmitErrorMessage(resolveBankApiErrorMessage(error));
    }
  }, [
    cancelRenameBank,
    editingBankId,
    editingBankName,
    resolveBankApiErrorMessage,
    setSubmitErrorMessage,
    specialTrainingBanks,
    upsertSpecialTrainingBank,
  ]);

  useEffect(() => {
    if (!selectedBank) {
      return;
    }
    setSelectedPoolIds((current) => {
      const nextPoolIds = selectedBank.scope.poolIds;
      const unchanged =
        current.length === nextPoolIds.length &&
        current.every((poolId, index) => poolId === nextPoolIds[index]);
      return unchanged ? current : [...nextPoolIds];
    });
    setModeRuntimeConfigById((current) => {
      let changed = false;
      const nextState = { ...current };
      SPECIAL_TRAINING_MODE_IDS.forEach((modeId) => {
        const currentConfig =
          current[modeId] ?? DEFAULT_MODE_RUNTIME_CONFIG_BY_ID[modeId];
        if (
          currentConfig.minimumBaseTimeframe === selectedBank.targetTimeframe
        ) {
          return;
        }
        changed = true;
        nextState[modeId] = {
          ...currentConfig,
          minimumBaseTimeframe: selectedBank.targetTimeframe,
        };
      });
      return changed ? nextState : current;
    });
  }, [selectedBank, setModeRuntimeConfigById]);

  const selectedPoolIdsByMode = useMemo(
    () => createModeSelectedPoolIdsMap(selectedPoolIds),
    [selectedPoolIds],
  );

  const activeSelectedPoolIds = useMemo(
    () => selectedPoolIds,
    [selectedPoolIds],
  );
  const activeSelectedPools = useMemo(
    () => resolvePoolsByIds(activeSelectedPoolIds, enabledSamplePoolById),
    [activeSelectedPoolIds, enabledSamplePoolById],
  );
  const activeSelectedSymbols = useMemo(
    () => resolveSymbolsFromPools(activeSelectedPools),
    [activeSelectedPools],
  );
  const selectedBankMissingPoolIds = selectedBank
    ? Array.from(
        new Set([
          ...selectedBank.scopeSummary.missingPoolIds,
          ...selectedBank.scope.poolIds.filter(
            (poolId) => !enabledSamplePoolById.has(poolId),
          ),
        ]),
      )
    : [];
  const activePoolCount = activeSelectedPools.length;
  const activeSymbolCount = activeSelectedSymbols.length;
  const bankEditorAvailablePools = useMemo(
    () => (!bankEditorDraft ? [] : normalizedEnabledSamplePools),
    [bankEditorDraft, normalizedEnabledSamplePools],
  );
  const bankEditorSelectedPoolIds =
    bankEditorDraft?.poolIds ?? EMPTY_BANK_EDITOR_SELECTED_POOL_IDS;
  const bankEditorTimeframeOptions = useMemo(
    () =>
      SPECIAL_TRAINING_BANK_TIMEFRAME_OPTIONS.map((timeframe) => ({
        value: timeframe,
        label: formatBankTimeframeLabel(timeframe),
      })),
    [formatBankTimeframeLabel],
  );
  const confirmDeleteBank = useCallback(
    async (bank: ApiSpecialTrainingBank) => {
      const normalizedBankId = String(bank.id || "").trim();
      if (!normalizedBankId) {
        return;
      }
      setSubmitErrorMessage("");
      try {
        await deleteSpecialTrainingBank(normalizedBankId);
        setSpecialTrainingBanks((current) =>
          current.filter((candidate) => candidate.id !== normalizedBankId),
        );
        if (selectedBankId === normalizedBankId) {
          setSelectedBankId("");
        }
      } catch (error) {
        void error;
        setSubmitErrorMessage(content.dataLoadFailedLabel);
      }
    },
    [content.dataLoadFailedLabel, selectedBankId, setSubmitErrorMessage],
  );
  const deleteConfirmWindowRevisionRef = useRef<number | null>(null);
  const requestDeleteBankConfirmation = useCallback(
    (bank: ApiSpecialTrainingBank) => {
      const normalizedBankId = String(bank.id || "").trim();
      if (!normalizedBankId) {
        return;
      }
      setSubmitErrorMessage("");
      void api
        .openDesktopSecondaryWindow({
          kind: "SPECIAL_TRAINING_BANK_DELETE_CONFIRM",
          title: formatMessage(
            language,
            "trainer.specialTrainingBanks.deleteDialogTitle",
          ),
          payload: {
            bankId: normalizedBankId,
            bankName: String(bank.name || "").trim() || normalizedBankId,
          },
        })
        .then((state) => {
          deleteConfirmWindowRevisionRef.current = state.revision;
        })
        .catch((error) => {
          if (isExpectedDesktopSecondaryWindowUnavailableError(error)) {
            console.debug(
              "[special-training-bank-delete-confirm] skipped outside Tauri",
            );
            return;
          }
          console.error(
            "[special-training-bank-delete-confirm] open failed",
            error,
          );
          setSubmitErrorMessage(content.dataLoadFailedLabel);
        });
    },
    [content.dataLoadFailedLabel, language, setSubmitErrorMessage],
  );
  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (
          message.kind !== "SPECIAL_TRAINING_BANK_DELETE_CONFIRM" ||
          message.action !== "CONFIRM_DELETE"
        ) {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            deleteConfirmWindowRevisionRef.current,
          )
        ) {
          return;
        }
        const payload = readSpecialTrainingBankDeleteConfirmActionPayload(
          message.payload,
        );
        if (!payload) {
          return;
        }
        const targetBank = specialTrainingBanks.find(
          (bank) => bank.id === payload.bankId,
        );
        if (!targetBank) {
          return;
        }
        void confirmDeleteBank(targetBank);
      }),
    [confirmDeleteBank, specialTrainingBanks],
  );
  const bankEditorStepIndex =
    SPECIAL_TRAINING_BANK_EDITOR_STEPS.indexOf(bankEditorStep);
  const {
    readModel: bankEditorReadModel,
    previewState: bankEditorPreviewState,
    setErrorMessage: setBankEditorReadModelErrorMessage,
  } = useSpecialTrainingBankEditorReadModel({
    isBankEditorOpen,
    bankEditorStep,
    bankEditorDraft,
    bankEditorSelectedPoolIds,
    bankEditorAvailablePools,
    enabledSamplePoolById,
    resolveBankApiErrorMessage,
  });
  const bankEditorMissingPoolIds =
    bankEditorReadModel.facts.scopeSummary?.missingPoolIds ?? [];
  const bankEditorPoolReadinessById = useMemo(
    () => createSpecialTrainingBankEditorPoolReadinessMap(bankEditorReadModel),
    [bankEditorReadModel],
  );
  const bankEditorSelectionStatus = useMemo(
    () =>
      readBankEditorSelectionBadge({
        missingPoolCount: bankEditorReadModel.facts.missingPoolCount,
        selectedPoolCount: bankEditorReadModel.facts.selectedPoolCount,
        isPoolsValid: bankEditorReadModel.facts.validation.pools.enabled,
        language,
      }),
    [
      bankEditorReadModel.facts.missingPoolCount,
      bankEditorReadModel.facts.selectedPoolCount,
      bankEditorReadModel.facts.validation.pools.enabled,
      language,
    ],
  );
  const bankEditorPoolOptions = useMemo(
    () =>
      resolveBankEditorPoolOptions({
        availablePools: bankEditorAvailablePools,
        draft: bankEditorDraft,
        selectedPoolIds: bankEditorSelectedPoolIds,
        poolReadinessById: bankEditorPoolReadinessById,
        formatBankTimeframeLabel,
        language,
      }),
    [
      bankEditorAvailablePools,
      bankEditorDraft,
      bankEditorPoolReadinessById,
      bankEditorSelectedPoolIds,
      formatBankTimeframeLabel,
      language,
    ],
  );
  const bankEditorPrimaryActionHint = useMemo(
    () =>
      resolveBankEditorPrimaryActionHint({
        blockReason: bankEditorReadModel.readiness.current.reasonCode,
        previewErrorMessage: bankEditorPreviewState.errorMessage,
        previewBlockedReason: String(
          bankEditorReadModel.readiness.current.facts.blockedReason ?? "",
        ),
        language,
      }),
    [
      bankEditorPreviewState.errorMessage,
      bankEditorReadModel.readiness.current.facts,
      bankEditorReadModel.readiness.current.reasonCode,
      language,
    ],
  );
  const readBankEditorStepCanAdvance = useCallback(
    (step: SpecialTrainingBankEditorStep): boolean =>
      step === "PREVIEW"
        ? bankEditorReadModel.readiness.preview.enabled
        : bankEditorReadModel.readiness.config.enabled,
    [
      bankEditorReadModel.readiness.config.enabled,
      bankEditorReadModel.readiness.preview.enabled,
    ],
  );
  const updateBankEditorDraft = useCallback(
    (
      updater:
        | Partial<SpecialTrainingBankEditorDraft>
        | ((
            current: SpecialTrainingBankEditorDraft,
          ) => SpecialTrainingBankEditorDraft),
    ) => {
      setBankEditorDraft((current) => {
        if (!current) {
          return current;
        }
        return typeof updater === "function"
          ? updater(current)
          : { ...current, ...updater };
      });
      setBankEditorReadModelErrorMessage("");
    },
    [setBankEditorReadModelErrorMessage],
  );
  const handleBankEditorTogglePool = useCallback(
    (poolId: string) => {
      setBankEditorAutoRemovedNotice("");
      updateBankEditorDraft((current) => {
        const nextPoolIds = current.poolIds.includes(poolId)
          ? current.poolIds.filter((id) => id !== poolId)
          : [...current.poolIds, poolId];
        return {
          ...current,
          poolIds: nextPoolIds,
        };
      });
    },
    [updateBankEditorDraft],
  );
  const handleBankEditorRemoveMissingPool = useCallback(
    (poolId: string) => {
      setBankEditorAutoRemovedNotice("");
      updateBankEditorDraft((current) => ({
        ...current,
        poolIds: current.poolIds.filter((id) => id !== poolId),
      }));
    },
    [updateBankEditorDraft],
  );
  const handleBankEditorTargetTimeframeChange = useCallback(
    (timeframe: BaseTimeframe) => {
      if (!bankEditorDraft) {
        return;
      }
      updateBankEditorDraft({
        targetTimeframe: timeframe,
      });
      setBankEditorAutoRemovedNotice("");
    },
    [bankEditorDraft, updateBankEditorDraft],
  );
  useEffect(() => {
    if (!bankEditorDraft) {
      return;
    }
    const removedPoolIds = bankEditorReadModel.facts.autoRemovedPoolIds;
    if (!removedPoolIds.length) {
      return;
    }
    const removedPoolIdSet = new Set(removedPoolIds);
    if (
      !bankEditorDraft.poolIds.some((poolId) => removedPoolIdSet.has(poolId))
    ) {
      return;
    }
    updateBankEditorDraft({
      poolIds: bankEditorReadModel.facts.compatibleSelectedPoolIds,
    });
    setBankEditorAutoRemovedNotice(
      formatMessage(
        language,
        "trainer.specialTrainingBanks.editorPoolsAutoRemovedNotice",
        {
          targetTimeframe: formatBankTimeframeLabel(
            bankEditorDraft.targetTimeframe,
          ),
          pools: joinWithMiddleDot(
            removedPoolIds.map((poolId) => {
              const pool = enabledSamplePoolById.get(poolId);
              if (!pool) {
                return poolId;
              }
              return `${pool.name} (${formatBankTimeframeLabel(
                pool.baseTimeframe,
              )})`;
            }),
          ),
        },
      ),
    );
  }, [
    bankEditorDraft,
    bankEditorReadModel.facts.autoRemovedPoolIds,
    bankEditorReadModel.facts.compatibleSelectedPoolIds,
    enabledSamplePoolById,
    formatBankTimeframeLabel,
    language,
    joinWithMiddleDot,
    updateBankEditorDraft,
  ]);
  const handleBankEditorStepChange = useCallback(
    (nextStep: SpecialTrainingBankEditorStep) => {
      const nextIndex = SPECIAL_TRAINING_BANK_EDITOR_STEPS.indexOf(nextStep);
      if (nextIndex < 0) {
        return;
      }
      if (nextIndex <= bankEditorStepIndex) {
        setBankEditorStep(nextStep);
        return;
      }
      for (let index = 0; index < nextIndex; index += 1) {
        const requiredStep = SPECIAL_TRAINING_BANK_EDITOR_STEPS[index];
        if (requiredStep && !readBankEditorStepCanAdvance(requiredStep)) {
          return;
        }
      }
      setBankEditorStep(nextStep);
    },
    [bankEditorStepIndex, readBankEditorStepCanAdvance],
  );
  const handleBankEditorNext = useCallback(() => {
    const nextStep =
      SPECIAL_TRAINING_BANK_EDITOR_STEPS[bankEditorStepIndex + 1];
    if (!nextStep || !readBankEditorStepCanAdvance(bankEditorStep)) {
      return;
    }
    setBankEditorStep(nextStep);
  }, [bankEditorStep, bankEditorStepIndex, readBankEditorStepCanAdvance]);
  const handleBankEditorBack = useCallback(() => {
    const previousStep =
      SPECIAL_TRAINING_BANK_EDITOR_STEPS[Math.max(0, bankEditorStepIndex - 1)];
    if (!previousStep || previousStep === bankEditorStep) {
      return;
    }
    setBankEditorStep(previousStep);
  }, [bankEditorStep, bankEditorStepIndex]);
  const handleBankEditorSave = useCallback(async () => {
    if (!bankEditorDraft || !bankEditorReadModel.readiness.preview.enabled) {
      return;
    }
    const normalizedPoolIds = Array.from(new Set(bankEditorSelectedPoolIds));
    if (!normalizedPoolIds.length) {
      return;
    }
    const firstSelectedPoolAssetClass = resolveAssetClassForPoolIds(
      normalizedPoolIds,
      enabledSamplePoolById,
    );
    try {
      const payload = {
        name: normalizeSpecialTrainingBankEditorName(bankEditorDraft.name),
        assetClass: firstSelectedPoolAssetClass,
        targetTimeframe: bankEditorDraft.targetTimeframe,
        poolIds: normalizedPoolIds,
      };
      const savedBank =
        bankEditorMode === "CREATE" || bankEditorMode === "COPY"
          ? await createSpecialTrainingBank(payload)
          : await updateSpecialTrainingBank(
              String(bankEditorDraft.sourceBankId || "").trim(),
              payload,
            );
      upsertSpecialTrainingBank(savedBank);
      setSelectedBankId(savedBank.id);
      closeBankEditor();
    } catch (error) {
      setBankEditorReadModelErrorMessage(resolveBankApiErrorMessage(error));
    }
  }, [
    bankEditorDraft,
    bankEditorMode,
    bankEditorSelectedPoolIds,
    closeBankEditor,
    enabledSamplePoolById,
    bankEditorReadModel.readiness.preview.enabled,
    resolveBankApiErrorMessage,
    setBankEditorReadModelErrorMessage,
    upsertSpecialTrainingBank,
  ]);
  const bankEditorWindowPayload =
    useMemo<SpecialTrainingBankEditorWindowPayload | null>(
      () =>
        createBankEditorWindowPayload({
          isOpen: isBankEditorOpen,
          language,
          content,
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
        }),
      [
        bankEditorAutoRemovedNotice,
        bankEditorDraft,
        bankEditorMissingPoolIds,
        bankEditorMode,
        bankEditorPoolOptions,
        bankEditorPreviewState,
        bankEditorPrimaryActionHint,
        bankEditorReadModel,
        bankEditorSelectionStatus,
        bankEditorStep,
        bankEditorStepIndex,
        bankEditorTimeframeOptions,
        content,
        formatBankTimeframeLabel,
        isBankEditorOpen,
        joinWithMiddleDot,
        language,
      ],
    );

  useEffect(() => {
    if (!bankEditorWindowPayload) {
      if (bankEditorWindowOpenedRef.current) {
        void api
          .closeDesktopSecondaryWindow("SPECIAL_TRAINING_BANK_EDITOR")
          .catch(() => undefined);
      }
      bankEditorWindowOpenedRef.current = false;
      bankEditorWindowRevisionRef.current = null;
      return;
    }

    const input = {
      kind: "SPECIAL_TRAINING_BANK_EDITOR" as const,
      title: bankEditorWindowPayload.title,
      payload: bankEditorWindowPayload,
    };

    if (!bankEditorWindowOpenedRef.current) {
      bankEditorWindowOpenedRef.current = true;
      void api
        .openDesktopSecondaryWindow(input)
        .then((state) => {
          bankEditorWindowRevisionRef.current = state.revision;
        })
        .catch((error) => {
          bankEditorWindowOpenedRef.current = false;
          bankEditorWindowRevisionRef.current = null;
          if (isExpectedDesktopSecondaryWindowUnavailableError(error)) {
            console.debug(
              "[special-training-bank-editor] skipped outside Tauri",
            );
            setIsBankEditorOpen(false);
            return;
          }
          console.error("[special-training-bank-editor] open failed", error);
          setSubmitErrorMessage(content.dataLoadFailedLabel);
          setIsBankEditorOpen(false);
        });
      return;
    }

    void api
      .publishDesktopSecondaryWindowState(input)
      .then((state) => {
        bankEditorWindowRevisionRef.current = state.revision;
      })
      .catch((error) => {
        bankEditorWindowOpenedRef.current = false;
        bankEditorWindowRevisionRef.current = null;
        console.error("[special-training-bank-editor] sync failed", error);
        setSubmitErrorMessage(content.dataLoadFailedLabel);
        setIsBankEditorOpen(false);
      });
  }, [
    bankEditorWindowPayload,
    content.dataLoadFailedLabel,
    setSubmitErrorMessage,
  ]);

  useEffect(
    () =>
      api.subscribeDesktopSecondaryWindowActions((message) => {
        if (message.kind !== "SPECIAL_TRAINING_BANK_EDITOR") {
          return;
        }
        if (
          !api.isCurrentDesktopSecondaryWindowAction(
            message,
            bankEditorWindowRevisionRef.current,
          )
        ) {
          return;
        }
        const payload = readActionPayloadObject(message.payload);
        switch (message.action) {
          case "CLOSE":
          case "WINDOW_CLOSED":
            bankEditorWindowOpenedRef.current = false;
            bankEditorWindowRevisionRef.current = null;
            closeBankEditor();
            break;
          case "SET_NAME":
            updateBankEditorDraft({
              name: String(payload?.value ?? ""),
            });
            break;
          case "SET_STEP":
            if (isBankEditorStepActionValue(payload?.step)) {
              handleBankEditorStepChange(payload.step);
            }
            break;
          case "TOGGLE_POOL": {
            const poolId = String(payload?.poolId ?? "").trim();
            if (poolId) {
              handleBankEditorTogglePool(poolId);
            }
            break;
          }
          case "REMOVE_MISSING_POOL": {
            const poolId = String(payload?.poolId ?? "").trim();
            if (poolId) {
              handleBankEditorRemoveMissingPool(poolId);
            }
            break;
          }
          case "SET_TARGET_TIMEFRAME":
            if (isBankEditorTimeframeActionValue(payload?.timeframe)) {
              handleBankEditorTargetTimeframeChange(payload.timeframe);
            }
            break;
          case "BACK":
            handleBankEditorBack();
            break;
          case "NEXT":
            handleBankEditorNext();
            break;
          case "SAVE":
            void handleBankEditorSave();
            break;
          default:
            break;
        }
      }),
    [
      closeBankEditor,
      handleBankEditorBack,
      handleBankEditorNext,
      handleBankEditorRemoveMissingPool,
      handleBankEditorSave,
      handleBankEditorStepChange,
      handleBankEditorTargetTimeframeChange,
      handleBankEditorTogglePool,
      updateBankEditorDraft,
    ],
  );
  const bankCardPreviewById = useSpecialTrainingBankCardPreviews({
    specialTrainingBanks,
    enabledSamplePoolById,
  });

  const filteredSpecialTrainingBanks = useFilteredSpecialTrainingBanks({
    banks: specialTrainingBanks,
    enabledSamplePoolById,
    searchQuery: bankSearchQuery,
  });
  const resolveBankCardPresentation = useCallback(
    (bank: ApiSpecialTrainingBank) => {
      const previewState =
        bankCardPreviewById[bank.id] ?? createEmptyBankCardPreviewState();
      return resolveSpecialTrainingBankCardPresentation({
        bank,
        previewState,
        enabledSamplePoolById,
        language,
      });
    },
    [bankCardPreviewById, enabledSamplePoolById, language],
  );

  return {
    activePoolCount,
    activeSelectedPoolIds,
    activeSelectedPools,
    activeSelectedSymbols,
    activeSymbolCount,
    bankSearchQuery,
    bankListTotal,
    bankEditorWindowPayload,
    cancelRenameBank,
    defaultSelectedPoolIds,
    editingBankId,
    editingBankName,
    enabledSamplePoolById,
    filteredSpecialTrainingBanks,
    formatBankTimeframeLabel,
    hasEnabledSampleSymbols,
    hasMoreSpecialTrainingBanks: Boolean(bankListNextCursor),
    isLoadingMoreBanks,
    closeBankEditor,
    handleBankEditorBack,
    handleBankEditorNext,
    handleBankEditorRemoveMissingPool,
    handleBankEditorSave,
    handleBankEditorStepChange,
    handleBankEditorTargetTimeframeChange,
    handleBankEditorTogglePool,
    openBankEditor,
    requestDeleteBankConfirmation,
    resolveBankApiErrorMessage,
    resolveBankCardPresentation,
    saveRenameBank,
    selectedBank,
    selectedBankId,
    selectedBankMissingPoolIds,
    selectedPoolIdsByMode,
    setBankSearchQuery,
    setEditingBankName,
    setSelectedBankId,
    specialTrainingBanks,
    startRenameBank,
    loadMoreSpecialTrainingBanks,
    updateBankEditorDraft,
  };
};
