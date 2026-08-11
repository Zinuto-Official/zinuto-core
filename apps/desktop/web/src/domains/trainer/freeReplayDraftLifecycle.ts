// SPDX-License-Identifier: GPL-3.0-only

type ResetFreeReplayDraftLifecycleArgs<TEnvironment> = {
  globalEnvironment: TEnvironment;
  resetActiveTrainerSession: () => void;
  invalidatePrepReadModel: () => void;
  clearPrepSelection: () => void;
  clearPrepAnchors: () => void;
  clearPrepInteractionState: () => void;
  restoreGlobalTradingSettingsForm: () => void;
  applyPrepEnvironment: (selection: TEnvironment) => void;
};

export const resetFreeReplayDraftLifecycle = <TEnvironment>({
  globalEnvironment,
  resetActiveTrainerSession,
  invalidatePrepReadModel,
  clearPrepSelection,
  clearPrepAnchors,
  clearPrepInteractionState,
  restoreGlobalTradingSettingsForm,
  applyPrepEnvironment,
}: ResetFreeReplayDraftLifecycleArgs<TEnvironment>): void => {
  resetActiveTrainerSession();
  invalidatePrepReadModel();
  clearPrepSelection();
  clearPrepAnchors();
  clearPrepInteractionState();
  restoreGlobalTradingSettingsForm();
  applyPrepEnvironment(globalEnvironment);
};
