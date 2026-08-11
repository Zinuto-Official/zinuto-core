// SPDX-License-Identifier: GPL-3.0-only

import { registerSystemOverlays } from '@/domains/chart/overlays';
export {
  attachStableElementResizeObserver,
  type StableElementResize,
  type StableElementResizeObserverHandle,
} from '@/domains/chart/chartStableResize';
export {
  getDrawingMinPointCount,
  hasDrawingOverlayInProgress,
  isDrawingOverlayInProgress,
  type DrawingOverlayStepLike
} from '@/domains/chart/drawingOverlayLifecycle';

export const registerCustomOverlays = (): void => {
  registerSystemOverlays();
};
