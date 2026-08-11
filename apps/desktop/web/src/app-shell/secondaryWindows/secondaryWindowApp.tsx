// SPDX-License-Identifier: GPL-3.0-only

import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  applyDesktopWebviewZoom,
  resetDesktopWebviewZoom,
  subscribeDesktopViewportChanges,
} from "@/api";
import {
  resolveDesktopSecondaryWindowKindFromLocation,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import {
  resolveDesktopSecondaryWindowZoomBase,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
import {
  DesktopSecondaryWindowRoot,
} from "@/app-shell/secondaryWindows/DesktopSecondaryWindowRoot";
import { installDesktopInteractionPolicy } from "@/ui/desktopInteractionPolicy";
import "@/styles/secondary-window.css";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { Button } from "@/ui/primitives/button";

type SecondaryWindowErrorBoundaryProps = {
  children: ReactNode;
};

type SecondaryWindowErrorBoundaryState = {
  hasError: boolean;
};

const SecondaryWindowFailureSurface = () => (
  <div className="secondary-window-fatal" role="alert">
    <strong>{tt("common.status.loadFailed")}</strong>
    <Button type="button" onClick={() => window.location.reload()}>
      {tt("appText.retry")}
    </Button>
  </div>
);

class SecondaryWindowErrorBoundary extends Component<
  SecondaryWindowErrorBoundaryProps,
  SecondaryWindowErrorBoundaryState
> {
  state: SecondaryWindowErrorBoundaryState = {
    hasError: false,
  };

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({ hasError: true });
    console.error("[zinuto-secondary-window-fatal]", {
      error,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <SecondaryWindowFailureSurface />;
    }
    return this.props.children;
  }
}

type ResolvedSecondaryWindowKind = ReturnType<
  typeof resolveDesktopSecondaryWindowKindFromLocation
>;

const applySecondaryWindowViewportZoom = async (
  kind: ResolvedSecondaryWindowKind,
): Promise<void> => {
  if (kind) {
    await applyDesktopWebviewZoom(resolveDesktopSecondaryWindowZoomBase(kind));
    return;
  }

  await resetDesktopWebviewZoom();
};

const bootstrapSecondaryWindowViewport = async (
  kind: ResolvedSecondaryWindowKind,
): Promise<() => void> => {
  await applySecondaryWindowViewportZoom(kind);

  if (!kind || typeof window === "undefined") {
    return () => undefined;
  }

  let disposed = false;
  let frameId = 0;
  let detachViewportChanges: () => void = () => undefined;
  const scheduleViewportZoom = () => {
    window.cancelAnimationFrame(frameId);
    frameId = window.requestAnimationFrame(() => {
      if (!disposed) {
        void applySecondaryWindowViewportZoom(kind);
      }
    });
  };
  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      scheduleViewportZoom();
    }
  };

  window.addEventListener("focus", scheduleViewportZoom);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  detachViewportChanges = await subscribeDesktopViewportChanges(scheduleViewportZoom);

  return () => {
    disposed = true;
    window.cancelAnimationFrame(frameId);
    detachViewportChanges();
    window.removeEventListener("focus", scheduleViewportZoom);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  };
};

const kind =
  typeof window === "undefined"
    ? null
    : resolveDesktopSecondaryWindowKindFromLocation(window.location);
let detachSecondaryWindowViewport: () => void = () => undefined;
let secondaryWindowPageHidden = false;

if (typeof window !== "undefined") {
  window.addEventListener(
    "pagehide",
    () => {
      secondaryWindowPageHidden = true;
      detachSecondaryWindowViewport();
    },
    { once: true },
  );
}

installDesktopInteractionPolicy(document, {
  allowGlobalTextSelection: import.meta.env.DEV,
});

const renderSecondaryWindow = () => {
  createRoot(document.getElementById("root")!).render(
    <SecondaryWindowErrorBoundary>
      {kind ? (
        <DesktopSecondaryWindowRoot kind={kind} />
      ) : (
        <SecondaryWindowFailureSurface />
      )}
    </SecondaryWindowErrorBoundary>,
  );
};

const SECONDARY_VIEWPORT_STARTUP_DEADLINE_MS = 1_000;

const startSecondaryWindow = async () => {
  const viewportTask = bootstrapSecondaryWindowViewport(kind).catch((error) => {
    console.warn(
      "[zinuto-secondary-window] viewport bootstrap failed; using current viewport",
      error,
    );
    return () => undefined;
  });
  let timeoutId = 0;
  const viewportBeforeRender = await Promise.race([
    viewportTask.then((detach) => ({ detach })),
    new Promise<null>((resolve) => {
      timeoutId = window.setTimeout(
        () => resolve(null),
        SECONDARY_VIEWPORT_STARTUP_DEADLINE_MS,
      );
    }),
  ]);
  if (timeoutId) {
    window.clearTimeout(timeoutId);
  }
  if (viewportBeforeRender) {
    detachSecondaryWindowViewport = viewportBeforeRender.detach;
  } else {
    void viewportTask.then((detach) => {
      if (secondaryWindowPageHidden) {
        detach();
        return;
      }
      detachSecondaryWindowViewport();
      detachSecondaryWindowViewport = detach;
    });
  }
  renderSecondaryWindow();
};

void startSecondaryWindow();
