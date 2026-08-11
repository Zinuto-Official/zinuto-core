// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import { isPriceMode } from '@zinuto/shared/trading';
import {
  getFreeReplayStartPointOverview,
  startPreparedFreeReplaySession,
} from '../application/trading/sessionService.js';
import { getFreeReplayPrepReadModel } from '../application/trading/freeReplayPrepReadModel.js';
import {
  listFreeReplayPoolDefaultEnvironments,
  setFreeReplayPoolDefaultEnvironment,
} from '../application/trading/freeReplayPoolDefaultEnvironmentService.js';
import {
  previewTrainingSummary,
  resetAllTraining,
  resetSymbolTraining,
} from '../application/trading/resetService.js';
import {
  freeReplayPoolDefaultEnvironmentSchema,
  freeReplayPrepReadModelSchema,
  freeReplayStartPointOverviewQuerySchema,
  freeReplayStartReadinessSchema,
  preparedFreeReplayStartSchema,
  resetSymbolSchema,
  resetTrainingSchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId } from './routeParams.js';

export const startPreparedFreeReplaySessionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = preparedFreeReplayStartSchema.parse(req.body ?? {});
  res.json(ok(await startPreparedFreeReplaySession(payload)));
};

export const getFreeReplayPrepReadModelController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = freeReplayPrepReadModelSchema.parse(req.body ?? {});
  res.json(ok(await getFreeReplayPrepReadModel(payload)));
};

const normalizeFreeReplayStartReadinessCandidates = (
  candidates: Array<{
    instrumentId?: unknown;
    symbol?: unknown;
    poolId?: unknown;
    poolName?: unknown;
    sourceTimeframe?: unknown;
  }>,
) =>
  Array.from(
    new Map(
      (Array.isArray(candidates) ? candidates : [])
        .map((candidate) => ({
          instrumentId: String(candidate.instrumentId || '').trim(),
          symbol: String(candidate.symbol || '').trim().toUpperCase(),
          poolId: String(candidate.poolId || '').trim(),
          poolName: String(candidate.poolName || '').trim(),
          sourceTimeframe:
            candidate.sourceTimeframe === '1m' ||
            candidate.sourceTimeframe === '5m' ||
            candidate.sourceTimeframe === '1h' ||
            candidate.sourceTimeframe === '1d'
              ? candidate.sourceTimeframe
              : '1d',
        }))
        .filter(
          (candidate) =>
            candidate.instrumentId &&
            candidate.symbol &&
            candidate.poolId &&
            candidate.poolName,
        )
        .map((candidate) => [candidate.instrumentId, candidate] as const),
    ).values(),
  );

export const resolveFreeReplayStartReadiness = (payload: {
  mode: 'RANDOM' | 'FOCUSED';
  selectedPoolId?: string;
  selectedInstrumentId?: string;
  selectedSymbol?: string;
  selectedAnchorIndex?: number;
  candidates: Array<{
    instrumentId: string;
    symbol: string;
    poolId: string;
    poolName: string;
    sourceTimeframe: '1m' | '5m' | '1h' | '1d';
  }>;
}) => {
  const candidates = normalizeFreeReplayStartReadinessCandidates(
    payload.candidates,
  );
  const selectedPoolId = String(payload.selectedPoolId || '').trim();
  const selectedInstrumentId = String(payload.selectedInstrumentId || '').trim();
  const normalizedSelectedSymbol = String(payload.selectedSymbol || '')
    .trim()
    .toUpperCase();
  const scopedCandidates = selectedPoolId
    ? candidates.filter((candidate) => candidate.poolId === selectedPoolId)
    : candidates;
  const requiresSymbol = payload.mode === 'FOCUSED';
  const requiresAnchor = payload.mode === 'FOCUSED';
  const hasExplicitAnchor = Number.isFinite(payload.selectedAnchorIndex);
  const selectedAnchorIndex = hasExplicitAnchor
    ? Math.max(0, Math.floor(Number(payload.selectedAnchorIndex)))
    : null;
  const hasSelectedCandidate =
    !requiresSymbol ||
    scopedCandidates.some((candidate) =>
      selectedInstrumentId
        ? candidate.instrumentId === selectedInstrumentId
        : candidate.symbol === normalizedSelectedSymbol,
    );
  const reasonCode =
    scopedCandidates.length <= 0
      ? 'NO_SAMPLES'
      : requiresSymbol && (!selectedInstrumentId || !hasSelectedCandidate)
        ? 'NO_SYMBOL'
        : requiresAnchor && !hasExplicitAnchor
          ? 'NO_ANCHOR'
          : null;
  const enabled = reasonCode === null;
  const readiness = {
    canStart: enabled,
    reason: reasonCode,
    requiresSymbol,
    requiresAnchor,
    hasExplicitAnchor,
    normalizedSelectedSymbol,
  };
  return {
    enabled,
    reasonCode,
    facts: {
      mode: payload.mode,
      candidateCount: candidates.length,
      scopedCandidateCount: scopedCandidates.length,
      selectedPoolId: selectedPoolId || null,
      selectedInstrumentId: selectedInstrumentId || null,
      selectedSymbol: normalizedSelectedSymbol || null,
      selectedAnchorIndex,
      requiresSymbol,
      requiresAnchor,
      hasExplicitAnchor,
      normalizedSelectedSymbol,
    },
    readiness,
  };
};

export const getFreeReplayStartReadinessController = (
  req: Request,
  res: Response,
): void => {
  const payload = freeReplayStartReadinessSchema.parse(req.body ?? {});
  res.json(ok(resolveFreeReplayStartReadiness(payload)));
};

export const getFreeReplayStartPointOverviewController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = freeReplayStartPointOverviewQuerySchema.parse(req.query ?? {});
  res.json(
    ok(
      await getFreeReplayStartPointOverview(
        query.instrumentId,
        query.minimumBaseTimeframe ?? '1d',
        query.offset,
        query.limit,
        {
          rawStartIndex: query.rawStartIndex,
          rawEndIndex: query.rawEndIndex,
          displayPeriod: query.displayPeriod,
        },
      ),
    ),
  );
};

export const listFreeReplayPoolDefaultEnvironmentsController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(listFreeReplayPoolDefaultEnvironments()));
};

export const setFreeReplayPoolDefaultEnvironmentController = (
  req: Request,
  res: Response,
): void => {
  const poolId = parseRouteId(req.params.poolId);
  const payload = freeReplayPoolDefaultEnvironmentSchema.parse(req.body ?? {});
  res.json(ok(setFreeReplayPoolDefaultEnvironment(poolId, payload)));
};

export const resetAllTrainingController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = resetTrainingSchema.parse(req.body ?? {});
  res.json(ok(await resetAllTraining(payload.finalizePriceMode)));
};

export const getTrainingSummaryController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const symbol = typeof req.query.symbol === 'string'
    ? req.query.symbol.trim().toUpperCase()
    : undefined;
  const timeframe =
    req.query.timeframe === '1m' ||
    req.query.timeframe === '5m' ||
    req.query.timeframe === '1h' ||
    req.query.timeframe === '1d'
      ? req.query.timeframe
      : '1d';
  const finalizePriceMode = isPriceMode(req.query.finalizePriceMode)
    ? req.query.finalizePriceMode
    : undefined;
  res.json(ok(await previewTrainingSummary(symbol, timeframe, finalizePriceMode)));
};

export const resetSymbolTrainingController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = resetSymbolSchema.parse(req.body);
  res.json(
    ok(
      await resetSymbolTraining(
        payload.symbol.toUpperCase(),
        payload.timeframe ?? '1d',
        payload.finalizePriceMode,
      ),
    ),
  );
};

export const getTrainingResetDialogReadModelController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { buildTrainingResetDialogReadModel } = await import(
    '../application/trainingResetDialogReadModel.js'
  );
  const { getTradingSettings } = await import(
    '../application/trading/sessionService.js'
  );
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const summary = payload.summary && typeof payload.summary === 'object'
    ? payload.summary as Record<string, unknown>
    : null;
  const settlementMode = payload.settlementMode === 'CURRENT_TOTAL_ASSET'
    ? 'CURRENT_TOTAL_ASSET'
    : 'FORCE_CLOSE';
  const terminationReasonCode = typeof payload.terminationReasonCode === 'string'
    ? payload.terminationReasonCode
    : null;
  const tradingSettings = await getTradingSettings();
  const initialSecuritiesBalance = Number(
    tradingSettings?.initialSecuritiesBalance ?? 0,
  );
  res.json(
    ok(
      buildTrainingResetDialogReadModel({
        summary: summary as {
          initialAsset?: number | null;
          endingAsset?: number | null;
          totalPnl?: number | null;
          assetReturnRate?: number | null;
          forcedLiquidationCount?: number | null;
          forcedLiquidationSellCount?: number | null;
          forcedLiquidationBuyCount?: number | null;
        } | null,
        initialSecuritiesBalance,
        settlementMode,
        terminationReasonCode,
      }),
    ),
  );
};
