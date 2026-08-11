// SPDX-License-Identifier: GPL-3.0-only

import type { ComponentType } from "react";
import type { UiLanguage } from "@/frontend-kernel/typography";
import type {
  DesktopSecondaryWindowKind,
  DesktopSecondaryWindowStatePayload,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import type { TradeColorThemeToken } from "@/ui/theme/visualColors";
import {
  SecondaryWindowLoadingSkeleton,
  type SecondaryWindowLoadingSkeletonStatus,
} from "@/app-shell/secondaryWindows/SecondaryWindowLoadingSkeleton";

export type SecondaryWindowPriceColorMode =
  | "RED_UP_GREEN_DOWN"
  | "GREEN_UP_RED_DOWN";

export type SecondaryWindowRouteProps = {
  kind: DesktopSecondaryWindowKind;
  state: DesktopSecondaryWindowStatePayload;
  language: UiLanguage;
  themeMode: "light" | "dark";
  showGlobalDecimals: boolean;
  priceColorMode: SecondaryWindowPriceColorMode;
  tradeColorTheme: TradeColorThemeToken;
};

export type SecondaryWindowRouteComponent =
  ComponentType<SecondaryWindowRouteProps>;

export type SecondaryWindowRouteModule = {
  default: SecondaryWindowRouteComponent;
};

export const SecondaryWindowRoutePlaceholder = ({
  state,
  status = "loading",
}: {
  state: DesktopSecondaryWindowStatePayload;
  status?: SecondaryWindowLoadingSkeletonStatus;
}) => (
  <SecondaryWindowLoadingSkeleton
    kind={state.kind}
    state={state}
    status={status}
  />
);
