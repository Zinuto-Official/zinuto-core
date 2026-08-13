// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/components/ui-system-business.css";
import "@/styles/components/onboarding-tour.css";

import {
  isDesktopOnboardingWindowPayload,
} from "@/app-shell/onboarding/desktopOnboardingWindowPayload";
import {
  DesktopOnboardingGuideFrame,
} from "@/app-shell/onboarding/DesktopOnboardingGuideFrame";
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
  const emit = (action: string, nextPayload?: unknown) => {
    void sendDesktopSecondaryWindowRouteAction(state, action, nextPayload).catch(
      () => undefined,
    );
  };

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-onboarding">
      <DesktopOnboardingGuideFrame payload={payload} onAction={emit} />
    </section>
  );
};

export default SecondaryOnboardingRoute;
