// SPDX-License-Identifier: GPL-3.0-only

import { api } from "@/api";
import type {
  DesktopSecondaryWindowStatePayload,
} from "@/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/ui/primitives/dialog";
import { AnchorNavigatorDialogProvider } from "@/domains/trainer/anchorNavigatorDialogContext";
import { AnchorNavigatorControl } from "@/domains/trainer/AnchorNavigatorControl";
import type {
  TrainerStartPointApplyPayload,
  TrainerStartPointInlineHistoryStatus,
  TrainerStartPointWindowPayload,
} from "@/domains/trainer/trainerStartPointTypes";
import { StandardSheetFrame } from "@/ui/components";

type TrainerStartPointPanelProps = {
  payload: TrainerStartPointWindowPayload;
  isActive?: boolean;
  onClose: () => void;
  onApplyAnchor: (selection: TrainerStartPointApplyPayload) => Promise<void>;
};

const TrainerStartPointPanel = ({
  payload,
  isActive = true,
  onClose,
  onApplyAnchor,
}: TrainerStartPointPanelProps) => (
  <AnchorNavigatorDialogProvider
    value={{
      requestClose: onClose,
    }}
  >
    <div className="trainer-start-point-drawer-panel">
      <AnchorNavigatorControl
        samplePoolId={payload.samplePoolId}
        instrumentId={payload.instrumentId}
        symbol={payload.symbol}
        sourceTimeframe={payload.sourceTimeframe}
        effectiveTimeframe={payload.effectiveTimeframe}
        language={payload.language}
        themeMode={payload.themeMode}
        currentRawAnchorIndex={payload.currentRawAnchorIndex ?? null}
        currentAnchorOverviewIndex={payload.currentAnchorOverviewIndex}
        currentAnchorTs={payload.currentAnchorTs}
        isActive={isActive}
        isDisabled={payload.isDisabled}
        isBusy={payload.isBusy}
        variant="embedded"
        commitMode="explicit"
        getOverviewRange={api.getFreeReplayStartPointOverview}
        onApplyAnchor={onApplyAnchor}
        ui={payload.ui}
      />
    </div>
  </AnchorNavigatorDialogProvider>
);

export const TrainerStartPointInlineHistory = ({
  payload,
  isActive = true,
  onApplyAnchor,
  onStatusChange,
}: {
  payload: TrainerStartPointWindowPayload;
  isActive?: boolean;
  onApplyAnchor: (selection: TrainerStartPointApplyPayload) => Promise<void>;
  onStatusChange?: (status: TrainerStartPointInlineHistoryStatus | null) => void;
}) => (
  <div className="trainer-start-point-inline-history">
    <AnchorNavigatorControl
      samplePoolId={payload.samplePoolId}
      instrumentId={payload.instrumentId}
      symbol={payload.symbol}
      sourceTimeframe={payload.sourceTimeframe}
      effectiveTimeframe={payload.effectiveTimeframe}
      language={payload.language}
      themeMode={payload.themeMode}
      currentRawAnchorIndex={payload.currentRawAnchorIndex ?? null}
      currentAnchorOverviewIndex={payload.currentAnchorOverviewIndex}
      currentAnchorTs={payload.currentAnchorTs}
      isActive={isActive}
      isDisabled={payload.isDisabled}
      isBusy={payload.isBusy}
      variant="embedded"
      commitMode="immediate"
      displayMode="history-preview"
      onPreviewStatusChange={onStatusChange}
      getOverviewRange={api.getFreeReplayStartPointOverview}
      onApplyAnchor={onApplyAnchor}
      ui={payload.ui}
    />
  </div>
);

export const TrainerStartPointDrawer = ({
  open,
  isActive = true,
  payload,
  onOpenChange,
  onApplyAnchor,
}: {
  open: boolean;
  isActive?: boolean;
  payload: TrainerStartPointWindowPayload | null;
  onOpenChange: (open: boolean) => void;
  onApplyAnchor: (selection: TrainerStartPointApplyPayload) => Promise<void>;
}) => (
  <Dialog
    open={isActive && open && Boolean(payload)}
    onOpenChange={(nextOpen) => {
      if (!nextOpen) {
        onOpenChange(false);
      }
    }}
  >
    {payload ? (
      <DialogContent
        layout="sheet-right"
        showCloseButton={false}
        className="ui-standard-sheet-content trainer-start-point-drawer trainer-start-point-drawer-dialog"
        aria-describedby={
          payload.description ? "trainer-start-point-drawer-description" : undefined
        }
      >
        <DialogTitle className="sr-only">{payload.title}</DialogTitle>
        {payload.description ? (
          <DialogDescription
            id="trainer-start-point-drawer-description"
            className="sr-only"
          >
            {payload.description}
          </DialogDescription>
        ) : null}
        <StandardSheetFrame
          className="trainer-start-point-drawer-frame"
          headerClassName="trainer-start-point-drawer-header"
          bodyClassName="trainer-start-point-drawer-body"
          title={payload.title}
          description={payload.description}
        >
          <TrainerStartPointPanel
            payload={payload}
            isActive={isActive}
            onClose={() => onOpenChange(false)}
            onApplyAnchor={onApplyAnchor}
          />
        </StandardSheetFrame>
      </DialogContent>
    ) : null}
  </Dialog>
);

export const TrainerStartPointSecondaryWindow = ({
  payload,
  state,
}: {
  payload: TrainerStartPointWindowPayload;
  state: DesktopSecondaryWindowStatePayload;
}) => (
  <section className="desktop-secondary-window-panel desktop-secondary-window-start-point trainer-start-point-drawer">
    <header className="desktop-secondary-window-start-point-header">
      <div className="desktop-secondary-window-start-point-title-block">
        <h1>{payload.title}</h1>
        {payload.description ? <p>{payload.description}</p> : null}
      </div>
    </header>
    <TrainerStartPointPanel
      payload={payload}
      onClose={() => {
        void api.closeCurrentDesktopSecondaryWindow();
      }}
      onApplyAnchor={async (selection) => {
        await api.sendDesktopSecondaryWindowRouteAction(
          state,
          "APPLY_ANCHOR",
          selection,
        );
      }}
    />
  </section>
);
