// SPDX-License-Identifier: GPL-3.0-only

import type { OhlcvBar } from '../../domain/models.js';
import { isAppError } from '../../kernel/appError.js';
import type { SessionRow } from '../../domain/trading/types.js';
import type { PendingNextOpenOrderRow } from '../ports/infrastructure/db/trading/sessionOrderStore.js';

export type PendingNextOpenFillFailureMode = 'CANCEL_AND_CONTINUE' | 'THROW';

type SessionOrderStore = {
  listPendingNextOpenOrdersBySubmitRange: (
    sessionId: string,
    startCursorExclusive: number,
    endCursorInclusive: number,
  ) => PendingNextOpenOrderRow[];
  cancelPendingOrderById: (orderId: string) => boolean;
};

type ExecutePendingNextOpenOrder = (input: {
  order: PendingNextOpenOrderRow;
  triggerIndex: number;
  bar: OhlcvBar;
  occurredAt: string;
}) => Promise<string[]>;

type CreateSessionPendingOrdersRuntimeDeps = {
  nowIso: () => string;
  getBarByIndex: (instrumentId: string, index: number) => Promise<OhlcvBar | undefined>;
  getBarsByInstrumentIdRange: (
    instrumentId: string,
    offset: number,
    limit: number,
  ) => Promise<OhlcvBar[]>;
  sessionOrderStore: SessionOrderStore;
};

export const createSessionPendingOrdersRuntime = ({
  nowIso,
  getBarByIndex,
  getBarsByInstrumentIdRange,
  sessionOrderStore,
}: CreateSessionPendingOrdersRuntimeDeps) => {
  const runPendingNextOpenOrdersByCursorRange = async (
    session: SessionRow,
    startCursorExclusive: number,
    endCursorInclusive: number,
    occurredAt = nowIso(),
    executePendingNextOpenOrder: ExecutePendingNextOpenOrder,
    options?: { fillFailureMode?: PendingNextOpenFillFailureMode },
  ): Promise<{ fillIds: string[]; forcedLiquidationCount: number }> => {
    if (endCursorInclusive <= startCursorExclusive) {
      return { fillIds: [], forcedLiquidationCount: 0 };
    }

    const pendingOrders = sessionOrderStore.listPendingNextOpenOrdersBySubmitRange(
      session.id,
      startCursorExclusive,
      endCursorInclusive,
    );
    if (!pendingOrders.length) {
      return { fillIds: [], forcedLiquidationCount: 0 };
    }

    const pendingOrdersByTriggerIndex = new Map<number, PendingNextOpenOrderRow[]>();
    for (const order of pendingOrders) {
      const triggerIndex = order.submit_index + 1;
      if (triggerIndex <= startCursorExclusive || triggerIndex > endCursorInclusive) {
        continue;
      }
      const bucket = pendingOrdersByTriggerIndex.get(triggerIndex);
      if (bucket) {
        bucket.push(order);
        continue;
      }
      pendingOrdersByTriggerIndex.set(triggerIndex, [order]);
    }

    if (!pendingOrdersByTriggerIndex.size) {
      return { fillIds: [], forcedLiquidationCount: 0 };
    }

    const triggerIndexes = [...pendingOrdersByTriggerIndex.keys()].sort((a, b) => a - b);
    const firstTriggerIndex = triggerIndexes[0];
    const lastTriggerIndex = triggerIndexes[triggerIndexes.length - 1];
    const triggerBars = await getBarsByInstrumentIdRange(
      session.instrument_id,
      firstTriggerIndex,
      lastTriggerIndex - firstTriggerIndex + 1,
    );
    const triggerBarByIndex = new Map<number, OhlcvBar>();
    for (let index = 0; index < triggerBars.length; index += 1) {
      triggerBarByIndex.set(firstTriggerIndex + index, triggerBars[index]);
    }

    const fillIds: string[] = [];
    let forcedLiquidationCount = 0;
    for (const triggerIndex of triggerIndexes) {
      const orders = pendingOrdersByTriggerIndex.get(triggerIndex);
      if (!orders?.length) {
        continue;
      }
      const bar =
        triggerBarByIndex.get(triggerIndex) ??
        (await getBarByIndex(session.instrument_id, triggerIndex));
      if (!bar) {
        continue;
      }
      for (const order of orders) {
        try {
          const orderFillIds = await executePendingNextOpenOrder({
            order,
            triggerIndex,
            bar,
            occurredAt,
          });
          fillIds.push(...orderFillIds);
          forcedLiquidationCount += Math.max(0, orderFillIds.length - 1);
        } catch (error) {
          if (!isAppError(error) || options?.fillFailureMode === 'THROW') {
            throw error;
          }
          sessionOrderStore.cancelPendingOrderById(order.id);
        }
      }
    }

    return { fillIds, forcedLiquidationCount };
  };

  return {
    runPendingNextOpenOrdersByCursorRange,
  };
};
