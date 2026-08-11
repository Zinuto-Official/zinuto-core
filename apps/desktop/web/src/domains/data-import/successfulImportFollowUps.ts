// SPDX-License-Identifier: GPL-3.0-only

type SettleSuccessfulFullImportFollowUpsParams<TPool extends { id: string }> = {
  sourceId: string;
  syncCustomSamplePoolsFromDataSources: () => Promise<TPool[]>;
  refreshInstruments: () => Promise<unknown>;
};

type SuccessfulFullImportFollowUps<TPool> = {
  nextPool: TPool | null;
  followUpFailed: boolean;
};

export const settleSuccessfulFullImportFollowUps = async <
  TPool extends { id: string },
>({
  sourceId,
  syncCustomSamplePoolsFromDataSources,
  refreshInstruments,
}: SettleSuccessfulFullImportFollowUpsParams<TPool>): Promise<SuccessfulFullImportFollowUps<TPool>> => {
  const [poolSyncResult, instrumentRefreshResult] = await Promise.allSettled([
    syncCustomSamplePoolsFromDataSources(),
    refreshInstruments(),
  ]);
  const normalizedSourceId = String(sourceId || '').trim();
  const nextPool =
    poolSyncResult.status === 'fulfilled'
      ? poolSyncResult.value.find(
          (pool) => String(pool.id || '').trim() === normalizedSourceId,
        ) ?? null
      : null;

  return {
    nextPool,
    followUpFailed:
      poolSyncResult.status === 'rejected'
      || instrumentRefreshResult.status === 'rejected'
      || !nextPool,
  };
};
