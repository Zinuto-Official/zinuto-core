// SPDX-License-Identifier: GPL-3.0-only

import type {
  ApiSpecialTrainingBankEditorPoolReasonCode,
  ApiSpecialTrainingBankEditorReadModel,
  ApiSpecialTrainingBankEditorReadiness,
  ApiSpecialTrainingBankEditorReasonCode,
  ApiSpecialTrainingBankEditorStep,
} from "@/api";

export type SpecialTrainingBankEditorPoolBlockedReasonCode =
  ApiSpecialTrainingBankEditorPoolReasonCode;
export type SpecialTrainingBankEditorBlockedReasonCode =
  ApiSpecialTrainingBankEditorReasonCode;
export type SpecialTrainingBankEditorPoolReadiness = {
  disabled: boolean;
  reasonCode: SpecialTrainingBankEditorPoolBlockedReasonCode | null;
};
export type SpecialTrainingBankEditorReadModel =
  ApiSpecialTrainingBankEditorReadModel;

const createPendingReadiness = (): ApiSpecialTrainingBankEditorReadiness => ({
  enabled: false,
  reasonCode: null,
  facts: {},
});

export const createPendingSpecialTrainingBankEditorReadModel = (
  step: ApiSpecialTrainingBankEditorStep,
): SpecialTrainingBankEditorReadModel => {
  const pendingReadiness = createPendingReadiness();
  return {
    enabled: false,
    reasonCode: null,
    facts: {
      step,
      selectedPoolCount: 0,
      missingPoolCount: 0,
      enabledInstrumentCount: 0,
      compatibleSelectedPoolIds: [],
      autoRemovedPoolIds: [],
      poolReadinessById: {},
      validation: {
        name: pendingReadiness,
        pools: pendingReadiness,
        preview: pendingReadiness,
      },
      scopeSummary: null,
    },
    readiness: {
      config: pendingReadiness,
      preview: pendingReadiness,
      current: pendingReadiness,
    },
  };
};

export const createSpecialTrainingBankEditorPoolReadinessMap = (
  readModel: SpecialTrainingBankEditorReadModel,
): ReadonlyMap<string, SpecialTrainingBankEditorPoolReadiness> =>
  new Map(Object.entries(readModel.facts.poolReadinessById));
