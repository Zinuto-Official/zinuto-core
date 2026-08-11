// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from "react";
import { buildCsvImportPoolNameConfirmationOptions } from "@/app-shell/csvMappingModalViewModel";
import type {
  AppCsvMappingModalProps,
  ConfirmPendingCsvImportOptions,
  CsvImportPlanConfigRow,
  PendingPoolNameDraft,
} from "@/app-shell/AppCsvMappingModalTypes";

export const useCsvMappingPoolNameDrafts = ({
  onPendingPlanPoolNameChange,
  pendingPlanConfigRows,
  presentation,
}: {
  onPendingPlanPoolNameChange: AppCsvMappingModalProps["onPendingPlanPoolNameChange"];
  pendingPlanConfigRows: CsvImportPlanConfigRow[];
  presentation: AppCsvMappingModalProps["presentation"];
}) => {
  const shouldDeferPoolNameCommit = presentation === "window";
  const [poolNameDrafts, setPoolNameDrafts] = useState<
    Record<string, PendingPoolNameDraft>
  >({});

  useEffect(() => {
    if (!shouldDeferPoolNameCommit) {
      setPoolNameDrafts((current) =>
        Object.keys(current).length ? {} : current,
      );
      return;
    }
    setPoolNameDrafts((current) => {
      const validPlanIds = new Set(
        pendingPlanConfigRows.map((row) =>
          String(row.previewPlanId || "").trim(),
        ),
      );
      let changed = false;
      const next: Record<string, PendingPoolNameDraft> = {};
      pendingPlanConfigRows.forEach((row) => {
        const planId = String(row.previewPlanId || "").trim();
        if (!planId) {
          return;
        }
        const committedValue = String(row.poolName ?? "");
        const existing = current[planId];
        if (!existing) {
          next[planId] = {
            value: committedValue,
            committedValue,
            dirty: false,
          };
          changed = true;
          return;
        }
        next[planId] = existing.dirty
          ? { ...existing, committedValue }
          : { value: committedValue, committedValue, dirty: false };
        if (
          next[planId].value !== existing.value ||
          next[planId].committedValue !== existing.committedValue ||
          next[planId].dirty !== existing.dirty
        ) {
          changed = true;
        }
      });
      Object.keys(current).forEach((planId) => {
        if (!validPlanIds.has(planId)) {
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [pendingPlanConfigRows, shouldDeferPoolNameCommit]);

  const updatePoolNameDraft = useCallback(
    (planIdRaw: string, poolName: string) => {
      const planId = String(planIdRaw || "").trim();
      if (!planId) {
        return;
      }
      if (!shouldDeferPoolNameCommit) {
        void onPendingPlanPoolNameChange(planId, poolName);
        return;
      }
      setPoolNameDrafts((current) => {
        const existing = current[planId] ?? {
          value: "",
          committedValue: "",
          dirty: false,
        };
        if (existing.value === poolName && existing.dirty) {
          return current;
        }
        return {
          ...current,
          [planId]: { ...existing, value: poolName, dirty: true },
        };
      });
    },
    [onPendingPlanPoolNameChange, shouldDeferPoolNameCommit],
  );

  const commitPoolNameDraft = useCallback(
    async (planIdRaw: string) => {
      if (!shouldDeferPoolNameCommit) {
        return;
      }
      const planId = String(planIdRaw || "").trim();
      const draft = planId ? poolNameDrafts[planId] : null;
      if (
        !planId ||
        !draft ||
        (!draft.dirty && draft.value === draft.committedValue)
      ) {
        return;
      }
      const committedValue = draft.value;
      await onPendingPlanPoolNameChange(planId, committedValue);
      setPoolNameDrafts((current) => {
        const existing = current[planId];
        if (!existing || existing.value !== committedValue) {
          return current;
        }
        return {
          ...current,
          [planId]: { ...existing, committedValue, dirty: false },
        };
      });
    },
    [onPendingPlanPoolNameChange, poolNameDrafts, shouldDeferPoolNameCommit],
  );

  const buildPoolNameConfirmationOptions = useCallback(
    (): ConfirmPendingCsvImportOptions | undefined =>
      buildCsvImportPoolNameConfirmationOptions({
        shouldDeferPoolNameCommit,
        pendingPlanConfigRows,
        poolNameDrafts,
      }),
    [pendingPlanConfigRows, poolNameDrafts, shouldDeferPoolNameCommit],
  );

  return {
    buildPoolNameConfirmationOptions,
    commitPoolNameDraft,
    poolNameDrafts,
    shouldDeferPoolNameCommit,
    updatePoolNameDraft,
  };
};
