// SPDX-License-Identifier: GPL-3.0-only

export type DrawingOverlayStepLike = {
  currentStep?: unknown;
};

export const isDrawingOverlayInProgress = (
  overlay: DrawingOverlayStepLike | null | undefined
): boolean => {
  if (!overlay || overlay.currentStep === null || overlay.currentStep === undefined) {
    return false;
  }
  const currentStep = Number(overlay.currentStep);
  return Number.isFinite(currentStep) && currentStep !== -1;
};

export const hasDrawingOverlayInProgress = (
  overlays: readonly DrawingOverlayStepLike[]
): boolean => overlays.some((overlay) => isDrawingOverlayInProgress(overlay));

export const getDrawingMinPointCount = (name: string): number => {
  if (
    name === 'horizontalStraightLine' ||
    name === 'verticalStraightLine' ||
    name === 'priceLine' ||
    name === 'simpleTag' ||
    name === 'simpleAnnotation'
  ) {
    return 1;
  }
  if (name === 'parallelStraightLine' || name === 'priceChannelLine') {
    return 3;
  }
  return 2;
};
