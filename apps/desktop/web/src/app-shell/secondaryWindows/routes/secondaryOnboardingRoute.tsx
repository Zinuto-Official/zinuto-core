// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/components/ui-system-business.css";
import "@/styles/components/onboarding-tour.css";

import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import {
  isDesktopOnboardingWindowPayload,
} from "@/app-shell/onboarding/desktopOnboardingWindowPayload";
import {
  DESKTOP_ONBOARDING_ROW_LABELS,
} from "@/domains/onboarding/desktopOnboardingModel";
import { VendorIcon } from "@/assets/graphics";
import { StandardModalFrame } from "@/ui/components";
import {
  sendDesktopSecondaryWindowRouteAction,
} from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import {
  SecondaryWindowRoutePlaceholder,
  type SecondaryWindowRouteProps,
} from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";

const SecondaryOnboardingRoute = ({ state }: SecondaryWindowRouteProps) => {
  if (!isDesktopOnboardingWindowPayload(state.payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const payload = state.payload;
  const shouldShowSkipAction = !payload.isFinalStep;
  const emit = (action: string, nextPayload?: unknown) => {
    void sendDesktopSecondaryWindowRouteAction(state, action, nextPayload).catch(
      () => undefined,
    );
  };
  const actions = (
    <>
      <div className="desktop-onboarding-footer-meta">
        <span>{payload.progressLabel}</span>
      </div>
      <div className="desktop-onboarding-action-group">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => emit("DEFER")}
        >
          {payload.deferLabel}
        </Button>
        {shouldShowSkipAction ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => emit("SKIP")}
          >
            {payload.skipLabel}
          </Button>
        ) : null}
        {payload.canGoBack ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => emit("BACK")}
          >
            {payload.backLabel}
          </Button>
        ) : null}
        {payload.isFinalStep ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => emit("COMPLETE")}
          >
            {payload.completeSetupLabel}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => emit(payload.isFinalStep ? "PRIMARY" : "NEXT")}
        >
          {payload.primaryIcon ? (
            <VendorIcon name={payload.primaryIcon} aria-hidden="true" />
          ) : null}
          <span>{payload.primaryLabel}</span>
        </Button>
      </div>
    </>
  );

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-onboarding">
      <StandardModalFrame
        variant="workflow"
        title={
          <div className="desktop-onboarding-title-group">
            <Badge variant="outline" className="desktop-onboarding-step-badge">
              {payload.setupLabel}
            </Badge>
            <span>{payload.title}</span>
          </div>
        }
        description={payload.body}
        actions={actions}
        footerMode="between"
        className="desktop-onboarding-frame"
        bodyClassName="desktop-onboarding-frame-body"
        footerClassName="desktop-onboarding-frame-footer"
      >
        <section className="desktop-onboarding-row-list">
          {payload.rows.map((row, index) => {
            const isSelected = row.targetId === payload.selectedTargetId;
            const rowTone = row.tone ?? "secondary";
            return (
              <Button
                key={row.targetId}
                type="button"
                variant="ghost"
                size="sm"
                className="desktop-onboarding-task-row"
                data-tone={rowTone}
                data-selected={isSelected ? "true" : undefined}
                aria-pressed={isSelected}
                onClick={() =>
                  emit("SELECT_TARGET", { targetId: row.targetId })
                }
              >
                <div className="desktop-onboarding-row-copy">
                  <span className="desktop-onboarding-row-heading">
                    <span
                      className="desktop-onboarding-row-index"
                      aria-hidden="true"
                    >
                      {DESKTOP_ONBOARDING_ROW_LABELS[index] ?? ""}
                    </span>
                    <span>{row.eyebrow}</span>
                  </span>
                  <strong>{row.title}</strong>
                  <p>{row.body}</p>
                </div>
              </Button>
            );
          })}
        </section>
      </StandardModalFrame>
    </section>
  );
};

export default SecondaryOnboardingRoute;
