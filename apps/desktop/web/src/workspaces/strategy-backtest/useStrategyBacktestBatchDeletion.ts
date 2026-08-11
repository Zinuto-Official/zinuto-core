// SPDX-License-Identifier: GPL-3.0-only

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { api, type ApiBacktestBatch } from "@/api";
import type { MessageId, MessageValues } from "@zinuto/shared/i18n";

type Translate = (id: MessageId, values?: MessageValues) => string;

type UseStrategyBacktestBatchDeletionOptions = {
  batches: ApiBacktestBatch[];
  isActive: boolean;
  issueDetailsBatchId: string | null;
  selectedBatchId: string;
  setBatches: Dispatch<SetStateAction<ApiBacktestBatch[]>>;
  setIssueDetailsBatchId: Dispatch<SetStateAction<string | null>>;
  setSelectedBatchId: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  t: Translate;
};

export const useStrategyBacktestBatchDeletion = ({
  batches,
  isActive,
  issueDetailsBatchId,
  selectedBatchId,
  setBatches,
  setIssueDetailsBatchId,
  setSelectedBatchId,
  setError,
  t,
}: UseStrategyBacktestBatchDeletionOptions) => {
  const [armedDeleteBatchId, setArmedDeleteBatchId] = useState<string | null>(null);
  const [isClearBatchesArmed, setIsClearBatchesArmed] = useState(false);
  const [isClearingBatches, setIsClearingBatches] = useState(false);

  const disarmDeletes = useCallback(() => {
    setArmedDeleteBatchId(null);
    setIsClearBatchesArmed(false);
  }, []);

  useEffect(() => {
    if (!isActive || (!armedDeleteBatchId && !isClearBatchesArmed)) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        disarmDeletes();
      }
    };
    const timer = window.setTimeout(disarmDeletes, 3000);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [armedDeleteBatchId, disarmDeletes, isActive, isClearBatchesArmed]);

  const handleDeleteBatch = useCallback(async (batchId: string) => {
    if (armedDeleteBatchId !== batchId) {
      setIsClearBatchesArmed(false);
      setArmedDeleteBatchId(batchId);
      return;
    }
    const previousBatches = batches;
    const deletedBatch = previousBatches.find((batch) => batch.id === batchId) ?? null;
    const nextSelectedBatchId = selectedBatchId === batchId
      ? previousBatches.find((batch) => batch.id !== batchId)?.id ?? ""
      : selectedBatchId;
    setArmedDeleteBatchId(null);
    setError("");
    setBatches((current) => current.filter((batch) => batch.id !== batchId));
    if (issueDetailsBatchId === batchId) {
      setIssueDetailsBatchId(null);
    }
    if (selectedBatchId === batchId) {
      setSelectedBatchId(nextSelectedBatchId);
    }
    try {
      await api.deleteBacktestBatch(batchId);
    } catch (deleteError) {
      console.error("[strategy-backtest] batch deletion failed", deleteError);
      setError(t("trainer.strategyBacktest.errorGeneric"));
      if (deletedBatch) {
        setBatches((current) => {
          if (current.some((batch) => batch.id === batchId)) {
            return current;
          }
          const next = [...current];
          const insertAt = Math.max(0, previousBatches.findIndex((batch) => batch.id === batchId));
          next.splice(Math.min(insertAt, next.length), 0, deletedBatch);
          return next;
        });
      }
      if (issueDetailsBatchId === batchId) {
        setIssueDetailsBatchId(batchId);
      }
      if (selectedBatchId === batchId) {
        setSelectedBatchId(batchId);
      }
    }
  }, [
    armedDeleteBatchId,
    batches,
    issueDetailsBatchId,
    selectedBatchId,
    setBatches,
    setError,
    setIssueDetailsBatchId,
    setSelectedBatchId,
    t,
  ]);

  const handleClearBatches = useCallback(async () => {
    if (!batches.length || isClearingBatches) {
      return;
    }
    if (!isClearBatchesArmed) {
      setArmedDeleteBatchId(null);
      setIsClearBatchesArmed(true);
      return;
    }
    const previousBatches = batches;
    const previousIssueDetailsBatchId = issueDetailsBatchId;
    const previousSelectedBatchId = selectedBatchId;
    setIsClearBatchesArmed(false);
    setIsClearingBatches(true);
    setError("");
    setBatches([]);
    setIssueDetailsBatchId(null);
    setSelectedBatchId("");
    try {
      await api.clearBacktestBatches();
    } catch (clearError) {
      console.error("[strategy-backtest] clearing batches failed", clearError);
      setError(t("trainer.strategyBacktest.errorGeneric"));
      setBatches((current) => current.length ? current : previousBatches);
      setIssueDetailsBatchId(previousIssueDetailsBatchId);
      setSelectedBatchId(previousSelectedBatchId);
    } finally {
      setIsClearingBatches(false);
    }
  }, [
    batches,
    isClearBatchesArmed,
    isClearingBatches,
    issueDetailsBatchId,
    selectedBatchId,
    setBatches,
    setError,
    setIssueDetailsBatchId,
    setSelectedBatchId,
    t,
  ]);

  return {
    armedDeleteBatchId,
    disarmDeleteBatch: () => setArmedDeleteBatchId(null),
    handleClearBatches,
    handleDeleteBatch,
    isClearBatchesArmed,
    isClearingBatches,
  };
};
