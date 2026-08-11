// SPDX-License-Identifier: GPL-3.0-only

import { performance } from 'node:perf_hooks';
import type { Request, Response } from 'express';
import {
  barsFrameQuerySchema,
  barsRangeQuerySchema,
  cleanupStaleSessionsSchema,
  instrumentListQuerySchema,
  orderQuoteSchema,
  playbackSchema,
  sessionActionSchema,
  sessionBootstrapQuerySchema,
  sessionBootstrapSchema,
  sessionSchema,
  snapshotQuerySchema,
  tradingSettingsSchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import {
  createOrGetSession,
  createOrGetSessionBootstrap,
  getBarsByInstrumentIdRange,
  getBarsFrameByInstrumentId,
  getLatestResumableSession,
  getPortfolioSummary,
  getSessionBootstrapById,
  getSessionRuntimeDelta,
  getSessionSnapshot,
  getTradingSettings,
  listInstruments,
  setSessionPlayback,
  setTradingSettings,
  updateSessionTradingSettings,
} from '../application/trading/sessionService.js';
import {
  executeSessionActionWithRuntimeDelta,
  getSessionOrderQuote,
} from '../application/trading/orderService.js';
import { cleanupStaleSessions } from '../application/trading/resetService.js';
import { parseRouteId } from './routeParams.js';
import { getApiRequestAbortSignal } from '../application/ports/runtime/apiRequestAbortSignal.js';

const formatHotActionDurationMs = (value: number): string =>
  Math.max(0, value).toFixed(2);

const setHotActionTimingHeader = (
  res: Response,
  segments: Array<[string, number]>,
): void => {
  res.setHeader(
    'X-Zinuto-Hot-Action-Timing',
    segments
      .map(([label, durationMs]) => `${label};dur=${formatHotActionDurationMs(durationMs)}`)
      .join(', '),
  );
};

const ACTION_CHART_FRAME_BEFORE_BARS = 1200;
const ACTION_CHART_FRAME_AFTER_BARS = 240;
const ACTION_CHART_FRAME_MAX_DISPLAY_BARS = 1441;

export const listInstrumentsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = instrumentListQuerySchema.parse(req.query ?? {});
  res.json(ok(await listInstruments(query)));
};

export const getTradingSettingsController = (
  _req: Request,
  res: Response,
): void => {
  res.json(ok(getTradingSettings()));
};

export const setTradingSettingsController = (
  req: Request,
  res: Response,
): void => {
  const payload = tradingSettingsSchema.parse(req.body);
  res.json(ok(setTradingSettings(payload)));
};

export const getPortfolioSummaryController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getPortfolioSummary()));
};

export const getBarsRangeController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = barsRangeQuerySchema.parse(req.query ?? {});
  res.json(
    ok(
      await getBarsByInstrumentIdRange(
        parseRouteId(req.params.instrumentId),
        query.offset,
        query.limit,
        { signal: getApiRequestAbortSignal() },
      ),
    ),
  );
};

export const getBarsFrameController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = barsFrameQuerySchema.parse(req.query ?? {});
  res.json(
    ok(
      await getBarsFrameByInstrumentId(
        parseRouteId(req.params.instrumentId),
        query.offset,
        query.limit,
        {
          displayPeriod: query.displayPeriod,
          anchorRawIndex: query.anchorRawIndex,
          anchorDisplayIndex: query.anchorDisplayIndex,
          direction: query.direction,
          before: query.before,
          after: query.after,
          maxDisplayBars: query.maxDisplayBars,
          signal: getApiRequestAbortSignal(),
        },
      ),
    ),
  );
};

export const createSessionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = sessionSchema.parse(req.body);
  const sessionTradingSettings = payload.sessionTradingSettings
    ? tradingSettingsSchema.parse(payload.sessionTradingSettings)
    : undefined;
  const session = await createOrGetSession(
    payload.symbol ?? '',
    payload.timeframe,
    payload.forceNew ?? false,
    payload.anchorIndex,
    {
      instrumentId: payload.instrumentId,
      samplePoolId: payload.samplePoolId,
      minimumBaseTimeframe: payload.minimumBaseTimeframe,
      sessionTradingSettings,
    },
  );
  res.json(ok(session));
};

export const createSessionBootstrapController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = sessionBootstrapSchema.parse(req.body);
  const sessionTradingSettings = payload.sessionTradingSettings
    ? tradingSettingsSchema.parse(payload.sessionTradingSettings)
    : undefined;
  res.json(
    ok(
      await createOrGetSessionBootstrap(
        payload.symbol ?? '',
        payload.timeframe,
        payload.forceNew ?? false,
        payload.anchorIndex,
        {
          instrumentId: payload.instrumentId,
          samplePoolId: payload.samplePoolId,
          minimumBaseTimeframe: payload.minimumBaseTimeframe,
          sessionTradingSettings,
          backwardBars: payload.backwardBars,
          forwardBars: payload.forwardBars,
        },
      ),
    ),
  );
};

export const cleanupStaleSessionsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = cleanupStaleSessionsSchema.parse(req.body ?? {});
  res.json(ok(await cleanupStaleSessions(payload.keepSessionId)));
};

export const getLatestResumableSessionController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await getLatestResumableSession()));
};

export const getSessionBootstrapController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = sessionBootstrapQuerySchema.parse(req.query ?? {});
  res.json(ok(await getSessionBootstrapById(parseRouteId(req.params.id), query)));
};

export const getSessionSnapshotController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = snapshotQuerySchema.parse(req.query ?? {});
  res.json(ok(await getSessionSnapshot(parseRouteId(req.params.id), query.fillCursor)));
};

export const updateSessionTradingSettingsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sessionId = parseRouteId(req.params.id);
  const payload = tradingSettingsSchema.parse(req.body ?? {});
  res.json(ok(await updateSessionTradingSettings(sessionId, payload)));
};

export const executeSessionActionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const routeStartedAtMs = performance.now();
  const sessionId = parseRouteId(req.params.id);
  const payload = sessionActionSchema.parse(req.body ?? {});
  const fillCursor = payload.fillCursor ?? null;
  const { result, runtimeDelta, timings } =
    await executeSessionActionWithRuntimeDelta(sessionId, payload, fillCursor);
  const chartFrameStartedAtMs = performance.now();
  const chartFrame = await getBarsFrameByInstrumentId(
    runtimeDelta.session.instrument_id,
    0,
    ACTION_CHART_FRAME_MAX_DISPLAY_BARS,
    {
      displayPeriod: runtimeDelta.displayPeriod,
      ...(Number.isFinite(runtimeDelta.displayIndex)
        ? { anchorDisplayIndex: Number(runtimeDelta.displayIndex) }
        : { anchorRawIndex: runtimeDelta.session.cursor_index }),
      before: ACTION_CHART_FRAME_BEFORE_BARS,
      after: ACTION_CHART_FRAME_AFTER_BARS,
      maxDisplayBars: ACTION_CHART_FRAME_MAX_DISPLAY_BARS,
      signal: getApiRequestAbortSignal(),
    },
  );
  const chartFrameEndedAtMs = performance.now();
  const { runtimeContext: _runtimeContext, ...publicResult } = result;
  void _runtimeContext;
  const responsePayload = ok({
    ...publicResult,
    session: runtimeDelta.session,
    runtimeDelta,
    chartFrame,
    advanceState: {
      displayPeriod: runtimeDelta.displayPeriod,
      cursorRawIndex: runtimeDelta.cursorRawIndex,
      displayStartIndex: chartFrame.displayStartIndex,
      displayEndIndex: chartFrame.displayEndIndex,
    },
  });
  const serializeStartedAtMs = performance.now();
  const responseBody = JSON.stringify(responsePayload);
  const serializeEndedAtMs = performance.now();
  setHotActionTimingHeader(res, [
    ['access', timings.accessMs],
    ['action', timings.actionMs],
    ['delta', timings.deltaMs],
    ['chartFrame', chartFrameEndedAtMs - chartFrameStartedAtMs],
    ['serialize', serializeEndedAtMs - serializeStartedAtMs],
    ['total', serializeEndedAtMs - routeStartedAtMs],
  ]);
  res.type('application/json').send(responseBody);
};

export const setSessionPlaybackController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sessionId = parseRouteId(req.params.id);
  const payload = playbackSchema.parse(req.body);
  const session = await setSessionPlayback(sessionId, payload.intervalMs, payload.isPaused);
  const runtimeDelta = await getSessionRuntimeDelta(
    sessionId,
    {
      session,
      fillIds: [],
      forcedLiquidationCount: 0,
      runtimeContext: payload.displayPeriod
        ? {
            action: 'STEP',
            displayPeriod: payload.displayPeriod,
            previousCursorRawIndex: Math.max(
              0,
              Math.floor(Number(session.cursor_index) || 0),
            ),
            previousDisplayIndex: null,
            previousDisplayStartRawIndex: null,
            previousDisplayEndRawIndex: null,
          }
        : undefined,
    },
    null,
  );
  const chartFrame = await getBarsFrameByInstrumentId(
    runtimeDelta.session.instrument_id,
    0,
    ACTION_CHART_FRAME_MAX_DISPLAY_BARS,
    {
      displayPeriod: runtimeDelta.displayPeriod,
      ...(Number.isFinite(runtimeDelta.displayIndex)
        ? { anchorDisplayIndex: Number(runtimeDelta.displayIndex) }
        : { anchorRawIndex: runtimeDelta.session.cursor_index }),
      before: ACTION_CHART_FRAME_BEFORE_BARS,
      after: ACTION_CHART_FRAME_AFTER_BARS,
      maxDisplayBars: ACTION_CHART_FRAME_MAX_DISPLAY_BARS,
      signal: getApiRequestAbortSignal(),
    },
  );
  res.json(ok({
    session: runtimeDelta.session,
    fillIds: [],
    forcedLiquidationCount: 0,
    runtimeDelta,
    chartFrame,
    advanceState: {
      displayPeriod: runtimeDelta.displayPeriod,
      cursorRawIndex: runtimeDelta.cursorRawIndex,
      displayStartIndex: chartFrame.displayStartIndex,
      displayEndIndex: chartFrame.displayEndIndex,
    },
  }));
};

export const getSessionOrderQuoteController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sessionId = parseRouteId(req.params.id);
  const payload = orderQuoteSchema.parse(req.body ?? {});
  res.json(ok(await getSessionOrderQuote(sessionId, payload)));
};

export const getSessionOrderEstimationReadModelController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const sessionId = parseRouteId(req.params.id);
  const payload = orderQuoteSchema.parse(req.body ?? {});
  const { buildOrderEstimationReadModel } = await import(
    '../application/trading/orderEstimationReadModel.js'
  );
  const buyQuote = await getSessionOrderQuote(sessionId, {
    ...payload,
    side: 'BUY',
  });
  const sellQuote = await getSessionOrderQuote(sessionId, {
    ...payload,
    side: 'SELL',
  });
  res.json(
    ok(
      buildOrderEstimationReadModel({
        buyQuote: buyQuote as Record<string, unknown>,
        sellQuote: sellQuote as Record<string, unknown>,
      }),
    ),
  );
};
