// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useMemo } from 'react';
import type { SystemSettingsWorkspacePageProps } from '@/workspaces/settings/SystemSettingsWorkspacePage';
import type { TradingAssetClassId, TradingCustomFeeTemplateMeta, TradingMarketPresetId } from '@/domains/trainer/tradingMarketPresets';
import type { CustomSamplePool } from '@/frontend-kernel/appTypes';
import type { SystemPoolTradingBindingById } from '@/app-shell/appRootPoolTradingBinding';

type UseWorkspaceKeepAliveStabilizersArgs = {
  loadMoreReplayNotes: () => Promise<void>;
  enabledSpecialTrainingSamplePools: unknown[];
  tradingAssetClass: TradingAssetClassId;
  tradingMarketPresetKey: TradingMarketPresetId;
  customSamplePools: CustomSamplePool[];
  systemPoolTradingBindingById: SystemPoolTradingBindingById;
  tradingMarketPresetCustomTemplates: TradingCustomFeeTemplateMeta[];
  handleSystemDevSimulationDataChanged: NonNullable<
    SystemSettingsWorkspacePageProps['devSimulationInput']['onDataChanged']
  >;
};

export const useWorkspaceKeepAliveStabilizers = ({
  loadMoreReplayNotes,
  handleSystemDevSimulationDataChanged
}: UseWorkspaceKeepAliveStabilizersArgs) => {
  const handleLoadMoreReplayNotes = useCallback(() => {
    void loadMoreReplayNotes();
  }, [loadMoreReplayNotes]);

  const systemSettingsDevSimulationInput = useMemo<SystemSettingsWorkspacePageProps['devSimulationInput']>(
    () => ({
      onDataChanged: handleSystemDevSimulationDataChanged
    }),
    [
      handleSystemDevSimulationDataChanged
    ]
  );

  return {
    handleLoadMoreReplayNotes,
    systemSettingsDevSimulationInput
  };
};
