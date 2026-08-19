// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import { Spinner } from "@/ui/primitives/loading";
import type { AcquisitionDialogPhase } from "@/workspaces/data/dataConfig/MarketDataAcquisitionSection";
import type { AcquisitionWizardStep } from "@/workspaces/data/dataConfig/MarketDataAcquisitionWizard";

type Translate = (key: string) => string;

type MarketDataAcquisitionActionBarsProps = {
  assetClassId: string | null;
  canStartOnline: boolean;
  catalogLoading: boolean;
  failedReturnStep: AcquisitionWizardStep;
  folderGrantId: string | null;
  hasInstruments: boolean;
  importRequestPending: boolean;
  isImportEntryBlocked: boolean;
  phase: AcquisitionDialogPhase;
  savedOutputFinalPath: string | null;
  selectedMarketPresent: boolean;
  selectedPlanAvailable: boolean;
  tt: Translate;
  wizardStep: AcquisitionWizardStep;
  onCancelDownload: () => void;
  onChooseFolder: () => void;
  onMoveToStep: (step: AcquisitionWizardStep) => void;
  onOpenFolder: () => void;
  onRequestClose: () => void;
  onRetrySave: () => void;
  onReturnToForm: (step: AcquisitionWizardStep) => void;
  onReviewAndImport: () => void;
  onStartDownload: () => void;
};

export const MarketDataAcquisitionActionBars = ({
  assetClassId,
  canStartOnline,
  catalogLoading,
  failedReturnStep,
  folderGrantId,
  hasInstruments,
  importRequestPending,
  isImportEntryBlocked,
  phase,
  savedOutputFinalPath,
  selectedMarketPresent,
  selectedPlanAvailable,
  tt,
  wizardStep,
  onCancelDownload,
  onChooseFolder,
  onMoveToStep,
  onOpenFolder,
  onRequestClose,
  onRetrySave,
  onReturnToForm,
  onReviewAndImport,
  onStartDownload,
}: MarketDataAcquisitionActionBarsProps) => {
  if (phase === "FORM") {
    if (wizardStep === 1) {
      return (
        <>
          <Button type="button" variant="outline" onClick={onRequestClose}>
            {tt("appText.cancel")}
          </Button>
          <Button
            type="button"
            disabled={!assetClassId || catalogLoading}
            onClick={() => onMoveToStep(2)}
          >
            {catalogLoading ? <Spinner decorative size="sm" /> : null}
            {tt("appText.marketDataAcquisitionContinue")}
          </Button>
        </>
      );
    }
    if (wizardStep === 2) {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onMoveToStep(1)}
          >
            {tt("appText.marketDataAcquisitionBack")}
          </Button>
          <Button
            type="button"
            disabled={
              !selectedMarketPresent || !selectedPlanAvailable
            }
            onClick={() => onMoveToStep(3)}
          >
            {tt("appText.marketDataAcquisitionContinue")}
          </Button>
        </>
      );
    }
    if (wizardStep === 3) {
      return (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onMoveToStep(2)}
          >
            {tt("appText.marketDataAcquisitionBack")}
          </Button>
          <Button
            type="button"
            disabled={!hasInstruments}
            onClick={() => onMoveToStep(4)}
          >
            {tt("appText.marketDataAcquisitionContinue")}
          </Button>
        </>
      );
    }
    return (
      <>
        <Button type="button" variant="outline" onClick={() => onMoveToStep(3)}>
          {tt("appText.marketDataAcquisitionBack")}
        </Button>
        <Button
          type="button"
          disabled={!canStartOnline}
          onClick={onStartDownload}
        >
          {tt("appText.marketDataAcquisitionStartDownload")}
        </Button>
      </>
    );
  }

  if (phase === "SAVED" && savedOutputFinalPath) {
    return (
      <>
        <Button type="button" variant="outline" onClick={onOpenFolder}>
          {tt("appText.marketDataAcquisitionOpenFolder")}
        </Button>
        <Button type="button" variant="outline" onClick={onRequestClose}>
          {tt("appText.marketDataAcquisitionImportLater")}
        </Button>
        <Button
          type="button"
          loading={importRequestPending}
          disabled={isImportEntryBlocked || importRequestPending}
          onClick={onReviewAndImport}
        >
          {tt("appText.marketDataAcquisitionReviewAndImport")}
        </Button>
      </>
    );
  }
  if (phase === "RUNNING") {
    return (
      <Button type="button" variant="outline" onClick={onCancelDownload}>
        {tt("appText.marketDataAcquisitionCancelDownload")}
      </Button>
    );
  }
  if (phase === "SAVING") {
    return (
      <Button type="button" disabled>
        <Spinner decorative size="sm" />
        {tt("appText.marketDataAcquisitionStageSaving")}
      </Button>
    );
  }
  if (phase === "READY_TO_SAVE") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onChooseFolder}>
          {tt("appText.marketDataAcquisitionChooseFolder")}
        </Button>
        <Button type="button" disabled={!folderGrantId} onClick={onRetrySave}>
          {tt("appText.marketDataAcquisitionRetrySave")}
        </Button>
      </>
    );
  }
  if (phase === "FAILED") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onRequestClose}>
          {tt("appText.close2")}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onReturnToForm(failedReturnStep)}
        >
          {tt("appText.marketDataAcquisitionAdjustSettings")}
        </Button>
        <Button
          type="button"
          disabled={!canStartOnline}
          onClick={onStartDownload}
        >
          {tt("appText.marketDataAcquisitionRetryDownload")}
        </Button>
      </>
    );
  }
  if (phase === "CANCELED") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onRequestClose}>
          {tt("appText.close2")}
        </Button>
        <Button type="button" onClick={() => onReturnToForm(4)}>
          {tt("appText.marketDataAcquisitionAdjustSettings")}
        </Button>
      </>
    );
  }
  return null;
};
