// SPDX-License-Identifier: GPL-3.0-only

export type {
  DesktopSecondaryWindowStatePayload,
  DesktopSecondaryWindowVisualContext,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
export {
  DESKTOP_SECONDARY_WINDOW_QUERY_PARAM,
  DESKTOP_SECONDARY_WINDOW_LANGUAGE_QUERY_PARAM,
  DESKTOP_SECONDARY_WINDOW_THEME_QUERY_PARAM,
  isDesktopSecondaryWindowKind,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
export type {
  DesktopSecondaryWindowActionAckPayload,
  DesktopSecondaryWindowActionPayload,
  DesktopSecondaryWindowSyncMode,
  DesktopSecondaryWindowSyncPolicy,
} from "@/api";
export {
  DESKTOP_SECONDARY_WINDOW_SYNC_POLICIES,
  applyDesktopWebviewZoom,
  closeCurrentDesktopSecondaryWindow,
  isCurrentDesktopSecondaryWindowAction,
  isDesktopSecondaryWindowLifecycleAction,
  notifyDesktopSecondaryWindowContentReady,
  notifyDesktopSecondaryWindowReady,
  notifyDesktopSecondaryWindowRouteReady,
  notifyDesktopSecondaryWindowShellReady,
  resizeCurrentDesktopSecondaryWindowToGeometry,
  resetDesktopWebviewZoom,
  sendDesktopSecondaryWindowAction,
  sendDesktopSecondaryWindowRouteAction,
  sendDesktopSecondaryWindowRouteActionWithAck,
  subscribeDesktopSecondaryWindowReuseCloseRequest,
  subscribeDesktopSecondaryWindowState,
  subscribeDesktopViewportChanges,
} from "@/api";
export {
  DESKTOP_SECONDARY_WINDOW_KINDS,
  resolveDesktopSecondaryWindowGeometry,
  resolveDesktopSecondaryWindowZoomBase,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
export type {
  DesktopSecondaryWindowGeometry,
  DesktopSecondaryWindowKind,
  DesktopSecondaryWindowZoomBase,
} from "@/frontend-kernel/secondary-windows/desktopWindowViewportConfig";
