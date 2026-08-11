// SPDX-License-Identifier: GPL-3.0-only

import { INPUT_LIMITS } from "@zinuto/shared/input-limits";
import { resolveSpecialTrainingBankScopeSummary } from "./banks.js";
import type {
  SpecialTrainingBankScopeBlockedReasonCode,
  SpecialTrainingBankScopeSummary,
} from "../../domain/specialTraining/contracts.js";
import type { SpecialTrainingBaseTimeframe } from "../../domain/specialTraining/timeframeSemantics.js";

type SpecialTrainingBankEditorStep = "CONFIG" | "PREVIEW";
type SpecialTrainingBankEditorReasonCode =
  | "NAME_REQUIRED"
  | SpecialTrainingBankScopeBlockedReasonCode
  | null;
type SpecialTrainingBankEditorPoolReasonCode =
  | "TARGET_TIMEFRAME_TOO_LOW"
  | "NO_SYMBOLS"
  | "NO_INSTRUMENTS"
  | "POOL_REPAIR_REQUIRED"
  | null;

type SpecialTrainingBankEditorReadiness = {
  enabled: boolean;
  reasonCode: SpecialTrainingBankEditorReasonCode;
  facts: Record<string, unknown>;
};

type SpecialTrainingBankEditorReadModel = {
  enabled: boolean;
  reasonCode: SpecialTrainingBankEditorReasonCode;
  facts: {
    step: SpecialTrainingBankEditorStep;
    selectedPoolCount: number;
    missingPoolCount: number;
    enabledInstrumentCount: number;
    compatibleSelectedPoolIds: string[];
    autoRemovedPoolIds: string[];
    poolReadinessById: Record<
      string,
      {
        disabled: boolean;
        reasonCode: SpecialTrainingBankEditorPoolReasonCode;
      }
    >;
    validation: {
      name: SpecialTrainingBankEditorReadiness;
      pools: SpecialTrainingBankEditorReadiness;
      preview: SpecialTrainingBankEditorReadiness;
    };
    scopeSummary: SpecialTrainingBankScopeSummary;
  };
  readiness: {
    config: SpecialTrainingBankEditorReadiness;
    preview: SpecialTrainingBankEditorReadiness;
    current: SpecialTrainingBankEditorReadiness;
  };
};

type SpecialTrainingBankEditorReadModelPayload = {
  step: SpecialTrainingBankEditorStep;
  draft: {
    name: string;
    targetTimeframe: SpecialTrainingBaseTimeframe;
    poolIds: string[];
  };
  availablePoolIds?: string[];
};

const normalizeIdList = (values: readonly string[] | undefined): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    output.push(id);
  });
  return output;
};

const resolveScopeReasonCode = (
  summary: SpecialTrainingBankScopeSummary,
): SpecialTrainingBankScopeBlockedReasonCode | null =>
  summary.validation.scope.blockedReasonCode ??
  summary.validation.targetTimeframe.blockedReasonCode ??
  summary.readiness.blockedReasonCode;

const resolvePoolReasonCode = (
  summary: SpecialTrainingBankScopeSummary,
): SpecialTrainingBankEditorPoolReasonCode => {
  const reasonCode = summary.readiness.blockedReasonCode;
  if (reasonCode === "TARGET_TIMEFRAME_INVALID") {
    return "TARGET_TIMEFRAME_TOO_LOW";
  }
  if (reasonCode === "POOL_REPAIR_REQUIRED") {
    return "POOL_REPAIR_REQUIRED";
  }
  if (reasonCode === "SYMBOLS_REQUIRED" || summary.status === "EMPTY") {
    return summary.instrumentCount <= 0 ? "NO_INSTRUMENTS" : "NO_SYMBOLS";
  }
  return null;
};

const createReadiness = (
  enabled: boolean,
  reasonCode: SpecialTrainingBankEditorReasonCode,
  facts: Record<string, unknown>,
): SpecialTrainingBankEditorReadiness => ({
  enabled,
  reasonCode,
  facts,
});

export const resolveSpecialTrainingBankEditorReadModel = (
  payload: SpecialTrainingBankEditorReadModelPayload,
): SpecialTrainingBankEditorReadModel => {
  const step: SpecialTrainingBankEditorStep =
    payload.step === "PREVIEW" ? "PREVIEW" : "CONFIG";
  const selectedPoolIds = normalizeIdList(payload.draft.poolIds);
  const availablePoolIds = normalizeIdList(payload.availablePoolIds);
  const targetTimeframe = payload.draft.targetTimeframe;
  const scopeSummary = resolveSpecialTrainingBankScopeSummary({
    targetTimeframe,
    poolIds: selectedPoolIds,
  });
  const trimmedName = String(payload.draft.name || "").trim();
  const nameReasonCode: SpecialTrainingBankEditorReasonCode =
    trimmedName.length > 0 &&
    trimmedName.length <= INPUT_LIMITS.specialTrainingBankNameChars
      ? null
      : "NAME_REQUIRED";
  const scopeReasonCode = resolveScopeReasonCode(scopeSummary);
  const configReasonCode = nameReasonCode ?? scopeReasonCode;
  const previewReasonCode = configReasonCode ?? scopeSummary.readiness.blockedReasonCode;
  const selectedAndAvailablePoolIds = normalizeIdList([
    ...availablePoolIds,
    ...selectedPoolIds,
  ]);
  const poolReadinessById = Object.fromEntries(
    selectedAndAvailablePoolIds.map((poolId) => {
      const poolSummary = resolveSpecialTrainingBankScopeSummary({
        targetTimeframe,
        poolIds: [poolId],
      });
      const reasonCode = resolvePoolReasonCode(poolSummary);
      return [
        poolId,
        {
          disabled: reasonCode !== null,
          reasonCode,
        },
      ];
    }),
  );
  const autoRemovedPoolIds = selectedPoolIds.filter(
    (poolId) =>
      poolReadinessById[poolId]?.reasonCode === "TARGET_TIMEFRAME_TOO_LOW",
  );
  const compatibleSelectedPoolIds = selectedPoolIds.filter(
    (poolId) => !autoRemovedPoolIds.includes(poolId),
  );
  const commonFacts = {
    step,
    selectedPoolCount: selectedPoolIds.length,
    missingPoolCount: scopeSummary.missingPoolIds.length,
    enabledInstrumentCount: scopeSummary.instrumentCount,
    compatibleSelectedPoolIds,
    autoRemovedPoolIds,
    poolReadinessById,
    scopeSummary,
  };
  const nameReadiness = createReadiness(nameReasonCode === null, nameReasonCode, {
    nameLength: trimmedName.length,
    maxNameLength: INPUT_LIMITS.specialTrainingBankNameChars,
  });
  const poolsReadiness = createReadiness(scopeReasonCode === null, scopeReasonCode, {
    selectedPoolCount: selectedPoolIds.length,
    missingPoolCount: scopeSummary.missingPoolIds.length,
    enabledInstrumentCount: scopeSummary.instrumentCount,
    status: scopeSummary.status,
    blockedReason: scopeSummary.readiness.blockedReason,
  });
  const configReadiness = createReadiness(configReasonCode === null, configReasonCode, {
    ...commonFacts,
    blockedReason:
      configReasonCode === "NAME_REQUIRED"
        ? null
        : scopeSummary.readiness.blockedReason,
  });
  const previewReadiness = createReadiness(previewReasonCode === null, previewReasonCode, {
    ...commonFacts,
    canUse: scopeSummary.readiness.canUse,
    blockedReason: scopeSummary.readiness.blockedReason,
  });
  const currentReadiness = step === "PREVIEW" ? previewReadiness : configReadiness;

  return {
    enabled: currentReadiness.enabled,
    reasonCode: currentReadiness.reasonCode,
    facts: {
      ...commonFacts,
      validation: {
        name: nameReadiness,
        pools: poolsReadiness,
        preview: previewReadiness,
      },
    },
    readiness: {
      config: configReadiness,
      preview: previewReadiness,
      current: currentReadiness,
    },
  };
};
