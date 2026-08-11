// SPDX-License-Identifier: GPL-3.0-only

import type { Chart, Overlay, OverlayCreate } from 'klinecharts';

export const SYSTEM_OVERLAY_RENDER_SIGNATURE_FIELD = '__zinutoSystemOverlayRenderSignature';

export type SystemOverlayCreate = OverlayCreate & {
  id: string;
  groupId: string;
  extendData?: Record<string, unknown>;
};

export const withSystemOverlaySignature = <T extends Record<string, unknown>>(
  extendData: T,
  signature: string
): T & Record<typeof SYSTEM_OVERLAY_RENDER_SIGNATURE_FIELD, string> => ({
  ...extendData,
  [SYSTEM_OVERLAY_RENDER_SIGNATURE_FIELD]: signature
});

const readSystemOverlaySignature = (
  overlay: Pick<Overlay, 'extendData'> | Pick<SystemOverlayCreate, 'extendData'>
): string => {
  const extendData =
    overlay.extendData && typeof overlay.extendData === 'object'
      ? overlay.extendData as Record<string, unknown>
      : {};
  const signature = extendData[SYSTEM_OVERLAY_RENDER_SIGNATURE_FIELD];
  return typeof signature === 'string' ? signature : '';
};

const removeOverlayById = (chart: Chart, id: string): boolean => {
  try {
    return chart.removeOverlay({ id });
  } catch {
    return false;
  }
};

const createOverlay = (chart: Chart, overlay: SystemOverlayCreate): boolean => {
  try {
    chart.createOverlay(overlay);
    return true;
  } catch {
    return false;
  }
};

const overrideOverlay = (chart: Chart, overlay: SystemOverlayCreate): boolean => {
  try {
    return chart.overrideOverlay(overlay);
  } catch {
    return false;
  }
};

export const syncSystemOverlayGroup = (
  chart: Chart,
  groupId: string,
  desiredOverlays: SystemOverlayCreate[]
): boolean => {
  const desiredById = new Map<string, SystemOverlayCreate>();
  desiredOverlays.forEach((overlay) => {
    desiredById.set(overlay.id, overlay);
  });

  const existingById = new Map<string, Overlay>();
  let changed = false;
  chart.getOverlays({ groupId }).forEach((overlay) => {
    if (!desiredById.has(overlay.id)) {
      changed = removeOverlayById(chart, overlay.id) || changed;
      return;
    }
    existingById.set(overlay.id, overlay);
  });

  desiredById.forEach((overlay, id) => {
    const existing = existingById.get(id);
    if (!existing) {
      changed = createOverlay(chart, overlay) || changed;
      return;
    }
    if (readSystemOverlaySignature(existing) === readSystemOverlaySignature(overlay)) {
      return;
    }
    changed = overrideOverlay(chart, overlay) || changed;
  });
  return changed;
};

export const syncSystemOverlayById = (
  chart: Chart,
  id: string,
  desiredOverlay: SystemOverlayCreate | null
): boolean => {
  const existing = chart.getOverlays({ id })[0];
  if (!desiredOverlay) {
    if (existing) {
      return removeOverlayById(chart, id);
    }
    return false;
  }

  if (!existing) {
    return createOverlay(chart, desiredOverlay);
  }
  if (readSystemOverlaySignature(existing) === readSystemOverlaySignature(desiredOverlay)) {
    return false;
  }
  return overrideOverlay(chart, desiredOverlay);
};
