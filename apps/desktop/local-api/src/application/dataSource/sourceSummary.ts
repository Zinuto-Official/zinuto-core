// SPDX-License-Identifier: GPL-3.0-only

import { getMarketStorageFootprint } from '../ports/infrastructure/db/marketDatabase.js';
import { dataSourceRepository } from '../ports/infrastructure/db/dataSource/dataSourceRepository.js';
import { estimateStorageBytesByBarShare, toSafeStorageBytes } from './importProgress.js';

export const summarizeSourceBars = async (
  sourceId: string
): Promise<{
  symbolCount: number;
  barCount: number;
  startTs: string | null;
  endTs: string | null;
}> => {
  const normalizedSourceId = String(sourceId ?? '').trim();
  if (!normalizedSourceId) {
    return {
      symbolCount: 0,
      barCount: 0,
      startTs: null,
      endTs: null
    };
  }

  const rows = dataSourceRepository.listLocalInstrumentSummaryRowsBySourceStmt.all(
    normalizedSourceId
  ) as Array<{
    symbol?: unknown;
    barCount?: unknown;
    timeStartTs?: unknown;
    timeEndTs?: unknown;
  }>;

  if (!rows.length) {
    return {
      symbolCount: 0,
      barCount: 0,
      startTs: null,
      endTs: null
    };
  }

  const normalizedSymbols = Array.from(
    new Set(
      rows
        .map((row) => String(row.symbol ?? '').trim().toUpperCase())
        .filter((item) => Boolean(item))
    )
  );

  let totalBars = 0;
  let startTs: string | null = null;
  let endTs: string | null = null;
  rows.forEach((row) => {
    totalBars += Math.max(0, Math.floor(Number(row.barCount ?? 0)));
    const candidateStartTs = typeof row.timeStartTs === 'string' && row.timeStartTs.trim() ? row.timeStartTs : null;
    const candidateEndTs = typeof row.timeEndTs === 'string' && row.timeEndTs.trim() ? row.timeEndTs : null;
    if (candidateStartTs && (!startTs || candidateStartTs < startTs)) {
      startTs = candidateStartTs;
    }
    if (candidateEndTs && (!endTs || candidateEndTs > endTs)) {
      endTs = candidateEndTs;
    }
  });

  return {
    symbolCount: normalizedSymbols.length,
    barCount: Math.max(0, Math.floor(Number(totalBars ?? 0))),
    startTs,
    endTs
  };
};

export const estimateSourceStorageBytesFromCurrentMarket = async (
  sourceBarCount: number,
  totalMarketBytesHint?: number
): Promise<number> => {
  const normalizedSourceBarCount = Math.max(0, Math.floor(Number(sourceBarCount) || 0));
  if (normalizedSourceBarCount <= 0) {
    return 0;
  }
  const totalBarCountRow =
    dataSourceRepository.sumLocalInstrumentBarCountStmt.get() as
      | { totalBarCount?: unknown }
      | undefined;
  const totalBarCount = Math.max(0, Number(totalBarCountRow?.totalBarCount ?? 0));
  const hintedBytes = Math.max(0, Math.floor(Number(totalMarketBytesHint) || 0));
  const totalMarketBytes =
    hintedBytes > 0
      ? hintedBytes
      : toSafeStorageBytes((await getMarketStorageFootprint()).totalBytes);
  return estimateStorageBytesByBarShare(normalizedSourceBarCount, totalBarCount, totalMarketBytes);
};
