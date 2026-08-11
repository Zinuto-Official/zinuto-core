// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar, Side } from '../../domain/models.js';
import type { SessionRow, TradingExecutionSettings } from '../../domain/trading/types.js';
import {
  type MarginRequirementInputRow,
  type MarginState,
  type MarginRatios,
} from '../../domain/trading/sessionMargin.js';
import { resolveTradingExecutionSettingsFromStoredJson } from './sessionTradingSettings.js';
import { POSITION_EPSILON, resolveContractMultiplier } from '../../domain/trading/orderSizing.js';

type OpenMarginPositionRow = {
  sessionId: string;
  instrumentId: string;
  qty: number;
  avgCost: number;
  cursorIndex: number;
  tradingSettingsJson: string | null;
};

export type LiquidationPositionRow = {
  sessionId: string;
  instrumentId: string;
  qty: number;
  avgCost: number;
  cursorIndex: number;
  fillBar: OhlcvBar;
  fillPrice: number;
  contractMultiplier: number;
  settings: TradingExecutionSettings;
  maintenanceContribution: number;
  closeSide: Side;
};

type SessionCashStore = {
  getSessionCashBalance: (session: SessionRow) => number;
};

type SessionPositionStore = {
  listOpenMarginPositions: (sessionId: string) => OpenMarginPositionRow[];
};

type SessionOrderStore = {
  createForcedLiquidationOrder: (input: {
    sessionId: string;
    instrumentId: string;
    side: Side;
    qty: number;
    submitIndex: number;
    createdAt: string;
  }) => string;
  cancelPendingOrderById: (orderId: string) => boolean;
};

type SessionMarginDomain = {
  resolveMarginRatios: (settings: TradingExecutionSettings) => MarginRatios;
  buildProjectedMarginRows: (
    sessionId: string,
    instrumentId: string,
    projectedCurrentQty: number,
    referencePrice: number,
    projectedSessionSettings: TradingExecutionSettings,
  ) => Promise<MarginRequirementInputRow[]>;
  calcMarginRequirements: (
    cash: number,
    positions: MarginRequirementInputRow[],
  ) => MarginState;
};

type CreateSessionMarginRuntimeDeps = {
  appError: (code: string, args?: Record<string, string | number | boolean | null>) => Error;
  round: (value: number, digits?: number) => number;
  nowIso: () => string;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  resolveSessionTradingSettings: (session: SessionRow) => TradingExecutionSettings;
  sessionCashStore: SessionCashStore;
  sessionPositionStore: SessionPositionStore;
  sessionOrderStore: SessionOrderStore;
  sessionMargin: SessionMarginDomain;
};

type ExecuteForcedLiquidationFill = (input: {
  orderId: string;
  side: Side;
  fillIndex: number;
  fillPrice: number;
  qty: number;
  fillBar: OhlcvBar;
  occurredAt: string;
}) => Promise<string>;

export const createSessionMarginRuntime = ({
  appError,
  round,
  nowIso,
  getBarByIndex,
  resolveSessionTradingSettings,
  sessionCashStore,
  sessionPositionStore,
  sessionOrderStore,
  sessionMargin,
}: CreateSessionMarginRuntimeDeps) => {
  const loadOpenMarginPositions = async (
    session: SessionRow,
  ): Promise<LiquidationPositionRow[]> => {
    const rows = sessionPositionStore.listOpenMarginPositions(session.id);

    const mapped: LiquidationPositionRow[] = [];
    for (const row of rows) {
      const qty = Number(row.qty);
      if (!Number.isFinite(qty) || Math.abs(qty) <= POSITION_EPSILON) {
        continue;
      }
      const cursorIndex = Math.max(0, Math.floor(Number(row.cursorIndex) || 0));
      const bar = await getBarByIndex(row.instrumentId, cursorIndex);
      const close = Number(bar?.close ?? 0);
      const avgCost = Math.max(0, Number(row.avgCost) || 0);
      const fillPrice = close > POSITION_EPSILON
        ? close
        : Math.max(POSITION_EPSILON, avgCost);
      const fillTime = String(bar?.ts ?? '').trim() || nowIso();
      const fillBar: OhlcvBar = bar ?? {
        ts: fillTime,
        open: fillPrice,
        high: fillPrice,
        low: fillPrice,
        close: fillPrice,
        volume: 0,
      };
      const settings = resolveTradingExecutionSettingsFromStoredJson(
        row.tradingSettingsJson,
      );
      const ratios = sessionMargin.resolveMarginRatios(settings);
      const contractMultiplier = resolveContractMultiplier(settings.contractMultiplier);
      const notional = Math.abs(qty) * fillPrice * contractMultiplier;
      const maintenanceRatio = qty > 0
        ? ratios.longMaintenanceRatio
        : ratios.shortMaintenanceRatio;
      mapped.push({
        sessionId: row.sessionId,
        instrumentId: row.instrumentId,
        qty,
        avgCost,
        cursorIndex,
        fillBar,
        fillPrice,
        contractMultiplier,
        settings,
        maintenanceContribution: round(notional * maintenanceRatio, 6),
        closeSide: qty > 0 ? 'SELL' : 'BUY',
      });
    }
    mapped.sort((left, right) => right.maintenanceContribution - left.maintenanceContribution);
    return mapped;
  };

  const getCurrentMarginState = async (
    session: SessionRow,
  ): Promise<{
    marginState: MarginState;
    positions: LiquidationPositionRow[];
  }> => {
    const positions = await loadOpenMarginPositions(session);
    const cash = sessionCashStore.getSessionCashBalance(session);
    return {
      marginState: sessionMargin.calcMarginRequirements(
        cash,
        positions.map((row) => ({
          qty: row.qty,
          fillPrice: row.fillPrice,
          contractMultiplier: row.contractMultiplier,
          settings: row.settings,
        })),
      ),
      positions,
    };
  };

  const assertInitialMarginSufficient = async (
    session: SessionRow,
    projectedQty: number,
    projectedCash: number,
    referencePrice: number,
    openLongQty: number,
    openShortQty: number,
  ): Promise<void> => {
    if (openLongQty <= POSITION_EPSILON && openShortQty <= POSITION_EPSILON) {
      return;
    }
    const settings = resolveSessionTradingSettings(session);
    const marginRows = await sessionMargin.buildProjectedMarginRows(
      session.id,
      session.instrument_id,
      projectedQty,
      referencePrice,
      settings,
    );
    const marginState = sessionMargin.calcMarginRequirements(projectedCash, marginRows);
    if (marginState.equity + POSITION_EPSILON >= marginState.requiredInitialEquity) {
      return;
    }
    if (openShortQty > POSITION_EPSILON) {
      throw appError('SHORT_MARGIN_INSUFFICIENT', {
        requiredEquity: marginState.requiredInitialEquity,
        availableEquity: marginState.equity,
        shortNotional: marginState.shortNotional,
      });
    }
    throw appError('ACCOUNT_BALANCE_INSUFFICIENT');
  };

  const enforceMaintenanceMarginWithLiquidation = async (
    session: SessionRow,
    occurredAt = nowIso(),
    executeForcedLiquidationFill: ExecuteForcedLiquidationFill,
  ): Promise<string[]> => {
    let state = await getCurrentMarginState(session);
    const hasOpenExposure = (nextState: typeof state): boolean =>
      nextState.marginState.longNotional + nextState.marginState.shortNotional > POSITION_EPSILON;
    if (
      !hasOpenExposure(state) ||
      state.marginState.equity + POSITION_EPSILON >= state.marginState.requiredMaintenanceEquity
    ) {
      return [];
    }

    const forcedFillIds: string[] = [];
    const LIQUIDATION_LOOP_MAX = 2048;
    for (let loopIndex = 0; loopIndex < LIQUIDATION_LOOP_MAX; loopIndex += 1) {
      const nextTarget = state.positions[0];
      if (!nextTarget) {
        break;
      }
      const closeQty = round(Math.max(0, Math.abs(Number(nextTarget.qty) || 0)), 8);
      if (!Number.isFinite(closeQty) || closeQty <= POSITION_EPSILON) {
        break;
      }
      const forcedOrderId = sessionOrderStore.createForcedLiquidationOrder({
        sessionId: nextTarget.sessionId,
        instrumentId: nextTarget.instrumentId,
        side: nextTarget.closeSide,
        qty: closeQty,
        submitIndex: nextTarget.cursorIndex,
        createdAt: occurredAt,
      });
      try {
        forcedFillIds.push(
          await executeForcedLiquidationFill({
            orderId: forcedOrderId,
            side: nextTarget.closeSide,
            fillIndex: nextTarget.cursorIndex,
            fillPrice: nextTarget.fillPrice,
            qty: closeQty,
            fillBar: nextTarget.fillBar,
            occurredAt,
          }),
        );
      } catch (error) {
        sessionOrderStore.cancelPendingOrderById(forcedOrderId);
        throw error;
      }

      state = await getCurrentMarginState(session);
      if (
        !hasOpenExposure(state) ||
        state.marginState.equity + POSITION_EPSILON >= state.marginState.requiredMaintenanceEquity
      ) {
        return forcedFillIds;
      }
    }

    throw appError('MARGIN_MAINTENANCE_INSUFFICIENT', {
      requiredEquity: state.marginState.requiredMaintenanceEquity,
      availableEquity: state.marginState.equity,
    });
  };

  return {
    assertInitialMarginSufficient,
    enforceMaintenanceMarginWithLiquidation,
    getCurrentMarginState,
  };
};
