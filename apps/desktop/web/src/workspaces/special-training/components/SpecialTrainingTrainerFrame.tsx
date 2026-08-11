// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";

type SpecialTrainingTrainerFrameProps = {
  chartWorkspace: ReactNode;
  floatingOverlay?: ReactNode;
  rightPanelBody: ReactNode;
  rightPanelBodyClassName: string;
  leftPanelTop?: ReactNode;
  leftPanelBodyClassName?: string;
};

export const SpecialTrainingTrainerFrame = ({
  chartWorkspace,
  floatingOverlay = null,
  rightPanelBody,
  rightPanelBodyClassName,
  leftPanelTop = null,
  leftPanelBodyClassName,
}: SpecialTrainingTrainerFrameProps) => (
  <section className="special-training-trainer-shell">
    {floatingOverlay ? (
      <div className="special-training-floating-overlay-slot">
        {floatingOverlay}
      </div>
    ) : null}
    <div className="app-shell special-training-trainer-app-shell">
      <section className="left-panel card special-training-trainer-left-panel">
        <div
          className={`special-training-trainer-left-panel-body ${
            leftPanelTop ? "has-top" : ""
          } ${leftPanelBodyClassName ?? ""}`.trim()}
        >
          {leftPanelTop ? (
            <div className="special-training-trainer-left-panel-top">
              {leftPanelTop}
            </div>
          ) : null}
          {chartWorkspace}
        </div>
      </section>

      <section className="right-panel card right-panel-no-head special-training-trainer-right-panel">
        <div className={rightPanelBodyClassName}>{rightPanelBody}</div>
      </section>
    </div>
  </section>
);
