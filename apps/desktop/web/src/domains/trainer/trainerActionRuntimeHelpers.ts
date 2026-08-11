// SPDX-License-Identifier: GPL-3.0-only

import type { TrainerSessionRuntimeResult } from '@/domains/trainer/trainerActionOrchestratorTypes';

export const nowMs = (): number => (typeof performance === 'undefined' ? 0 : performance.now());

export const normalizeForcedLiquidationCount = (
  result: TrainerSessionRuntimeResult | null | undefined,
): number => {
  const raw = Number(result?.forcedLiquidationCount ?? 0);
  if (!Number.isFinite(raw)) {
    return 0;
  }
  return Math.max(0, Math.floor(raw));
};

export const resolveActionErrorMessage = (error: unknown, fallback: string): string => {
  console.error('[trainer-action] request failed', error);
  return fallback;
};
