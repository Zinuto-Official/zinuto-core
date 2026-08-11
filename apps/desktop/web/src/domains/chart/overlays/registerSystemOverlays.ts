// SPDX-License-Identifier: GPL-3.0-only

import { registerDiagnosticFocusOverlay } from '@/domains/chart/overlays/diagnosticFocusOverlay';
import { registerNoteMarkerOverlay } from '@/domains/chart/overlays/noteMarkerOverlay';
import { registerPositionLineOverlay } from '@/domains/chart/overlays/positionLineOverlay';
import { registerSpecialTrainingDecisionMarkOverlay } from '@/domains/chart/overlays/specialTrainingDecisionMarkOverlay';
import { registerSpecialTrainingDecisionReferenceOverlay } from '@/domains/chart/overlays/specialTrainingDecisionReferenceOverlay';
import { registerSpecialTrainingExtremeTagOverlay } from '@/domains/chart/overlays/specialTrainingExtremeTagOverlay';
import { registerTradeMarkerOverlay } from '@/domains/chart/overlays/tradeMarkerOverlay';

let overlaysRegistered = false;

export const registerSystemOverlays = (): void => {
  if (overlaysRegistered) {
    return;
  }

  registerTradeMarkerOverlay();
  registerPositionLineOverlay();
  registerNoteMarkerOverlay();
  registerDiagnosticFocusOverlay();
  registerSpecialTrainingDecisionMarkOverlay();
  registerSpecialTrainingDecisionReferenceOverlay();
  registerSpecialTrainingExtremeTagOverlay();
  overlaysRegistered = true;
};
