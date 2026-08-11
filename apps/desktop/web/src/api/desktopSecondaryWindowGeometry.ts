// SPDX-License-Identifier: GPL-3.0-only

import {
  fitDesktopSecondaryWindowGeometryToWorkArea,
  resolveDesktopSecondaryWindowOwnerCenterPosition,
  type DesktopSecondaryWindowGeometry,
  type DesktopSecondaryWindowKind,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
import { settleTauriTaskWithinDeadline } from "@/frontend-kernel/tauriEventCleanup";
import {
  isTauriRuntime,
  loadTauriWebviewWindowModule,
  loadTauriWindowModule,
} from "@/api/desktopNativeBridge";

export type DesktopOnboardingSidecarTargetRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type DesktopWindowGeometryTarget = {
  setMinSize?: unknown;
  setSize?: unknown;
  center?: unknown;
};

type DesktopWindowPositionTarget = {
  outerPosition: () => Promise<{ x: number; y: number }>;
  outerSize: () => Promise<{ width: number; height: number }>;
  setPosition: (
    position:
      | import("@tauri-apps/api/dpi").PhysicalPosition
      | import("@tauri-apps/api/dpi").LogicalPosition
      | import("@tauri-apps/api/dpi").Position,
  ) => Promise<void>;
};

const DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS = 1_200;

const clampDesktopPhysicalCoordinate = (
  value: number,
  min: number,
  max: number,
): number => {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
};

export const positionDesktopOnboardingSidecar = async (
  getLabel: (kind: DesktopSecondaryWindowKind) => string,
  targetRect: DesktopOnboardingSidecarTargetRect | null = null,
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const [windowModule, webviewWindowModule] = await Promise.all([
      loadTauriWindowModule(),
      loadTauriWebviewWindowModule(),
    ]);
    const mainWindow = windowModule.getCurrentWindow();
    const onboardingWindow = await webviewWindowModule.WebviewWindow.getByLabel(
      getLabel("ONBOARDING_TOUR"),
    );
    if (!onboardingWindow || typeof window === "undefined") {
      return;
    }

    const [mainInnerPosition, mainInnerSize, onboardingSize, monitor] =
      await Promise.all([
        mainWindow.innerPosition(),
        mainWindow.innerSize(),
        onboardingWindow.outerSize(),
        windowModule.currentMonitor(),
      ]);
    const workArea = monitor?.workArea ?? {
      position: { x: 0, y: 0 },
      size: mainInnerSize,
    };
    const margin = 24;
    const gap = 16;
    const cssViewportWidth = Math.max(1, window.innerWidth || 1);
    const cssViewportHeight = Math.max(1, window.innerHeight || 1);
    const cssToPhysicalX = mainInnerSize.width / cssViewportWidth;
    const cssToPhysicalY = mainInnerSize.height / cssViewportHeight;
    const mainLeft = mainInnerPosition.x;
    const mainTop = mainInnerPosition.y;
    const mainRight = mainLeft + mainInnerSize.width;
    const mainCenterX = mainLeft + mainInnerSize.width / 2;
    const targetCenterX = targetRect
      ? mainLeft + (targetRect.left + targetRect.width / 2) * cssToPhysicalX
      : mainCenterX;
    const targetCenterY = targetRect
      ? mainTop + (targetRect.top + targetRect.height / 2) * cssToPhysicalY
      : mainTop + mainInnerSize.height / 2;
    const shouldPlaceRight = targetCenterX < mainCenterX;
    const preferredX = shouldPlaceRight
      ? mainRight + gap
      : mainLeft - onboardingSize.width - gap;
    const fallbackX = shouldPlaceRight
      ? workArea.position.x +
        workArea.size.width -
        onboardingSize.width -
        margin
      : workArea.position.x + margin;
    const minX = workArea.position.x + margin;
    const maxX =
      workArea.position.x + workArea.size.width - onboardingSize.width - margin;
    const hasPreferredSpace = shouldPlaceRight
      ? preferredX <= maxX
      : preferredX >= minX;
    const nextX = clampDesktopPhysicalCoordinate(
      hasPreferredSpace ? preferredX : fallbackX,
      minX,
      Math.max(minX, maxX),
    );
    const minY = workArea.position.y + margin;
    const maxY =
      workArea.position.y +
      workArea.size.height -
      onboardingSize.height -
      margin;
    const nextY = clampDesktopPhysicalCoordinate(
      targetCenterY - onboardingSize.height / 2,
      minY,
      Math.max(minY, maxY),
    );

    await onboardingWindow.setPosition(
      new windowModule.PhysicalPosition(Math.round(nextX), Math.round(nextY)),
    );
  } catch (error) {
    console.error("[desktop-onboarding] sidecar position failed", error);
  }
};

export const applyDesktopSecondaryWindowGeometry = async (
  windowRef: DesktopWindowGeometryTarget,
  windowModule: Awaited<ReturnType<typeof loadTauriWindowModule>>,
  geometry: DesktopSecondaryWindowGeometry,
  options: { center?: boolean } = {},
): Promise<void> => {
  const setMinSize = windowRef.setMinSize;
  const setSize = windowRef.setSize;
  if (typeof setMinSize !== "function" || typeof setSize !== "function") {
    return;
  }
  await setMinSize.call(
    windowRef,
    new windowModule.LogicalSize(geometry.minWidth, geometry.minHeight),
  );
  await setSize.call(
    windowRef,
    new windowModule.LogicalSize(geometry.width, geometry.height),
  );
  if (options.center && typeof windowRef.center === "function") {
    await windowRef.center.call(windowRef);
  }
};

export const positionDesktopSecondaryWindowAtMainCenter = async (
  windowRef: DesktopWindowPositionTarget,
  windowModule: Awaited<ReturnType<typeof loadTauriWindowModule>>,
): Promise<void> => {
  const mainWindow = windowModule.getCurrentWindow();
  const [mainPosition, mainSize, secondarySize] = await Promise.all([
    mainWindow.outerPosition(),
    mainWindow.outerSize(),
    windowRef.outerSize(),
  ]);
  const position = resolveDesktopSecondaryWindowOwnerCenterPosition(
    {
      position: mainPosition,
      size: mainSize,
    },
    secondarySize,
  );
  if (!position) {
    return;
  }
  await windowRef.setPosition(
    new windowModule.PhysicalPosition(position.x, position.y),
  );
};

export const resolveDesktopSecondaryWindowGeometryForCurrentMonitor = async (
  windowModule: Awaited<ReturnType<typeof loadTauriWindowModule>>,
  geometry: DesktopSecondaryWindowGeometry,
): Promise<DesktopSecondaryWindowGeometry> => {
  try {
    const monitor = await settleTauriTaskWithinDeadline(
      windowModule.currentMonitor(),
      "SECONDARY_CURRENT_MONITOR",
      DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
    );
    const scaleFactor =
      monitor && Number.isFinite(monitor.scaleFactor) && monitor.scaleFactor > 0
        ? monitor.scaleFactor
        : 1;
    const workAreaSize = monitor?.workArea?.size ?? monitor?.size;
    return fitDesktopSecondaryWindowGeometryToWorkArea(geometry, {
      width: Math.max(0, Number(workAreaSize?.width) || 0) / scaleFactor,
      height: Math.max(0, Number(workAreaSize?.height) || 0) / scaleFactor,
    });
  } catch {
    return geometry;
  }
};

export const resizeCurrentDesktopSecondaryWindowToGeometry = async (
  geometry: DesktopSecondaryWindowGeometry,
  options: { center?: boolean } = {},
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const windowModule = await loadTauriWindowModule();
    const fittedGeometry =
      await resolveDesktopSecondaryWindowGeometryForCurrentMonitor(
        windowModule,
        geometry,
      );
    await settleTauriTaskWithinDeadline(
      applyDesktopSecondaryWindowGeometry(
        windowModule.getCurrentWindow(),
        windowModule,
        fittedGeometry,
        options,
      ),
      "SECONDARY_WINDOW_RESIZE",
      DESKTOP_SECONDARY_HOST_OPERATION_DEADLINE_MS,
    );
  } catch {
    // Ignore unsupported window geometry calls outside the active desktop runtime.
  }
};
