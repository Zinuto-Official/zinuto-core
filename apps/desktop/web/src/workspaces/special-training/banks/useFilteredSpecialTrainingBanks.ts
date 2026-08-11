// SPDX-License-Identifier: GPL-3.0-only

import { useMemo } from "react";
import type { ApiSpecialTrainingBank } from "@/api";
import { filterSpecialTrainingBanks } from "@/workspaces/special-training/banks/specialTrainingBankPoolHelpers";
import type { NormalizedEnabledSamplePool } from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";

export const useFilteredSpecialTrainingBanks = ({
  banks,
  enabledSamplePoolById,
  searchQuery,
}: {
  banks: ApiSpecialTrainingBank[];
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>;
  searchQuery: string;
}) => {
  const normalizedBankSearchQuery = searchQuery.trim().toUpperCase();
  return useMemo(
    () =>
      filterSpecialTrainingBanks({
        banks,
        enabledSamplePoolById,
        normalizedBankSearchQuery,
      }),
    [banks, enabledSamplePoolById, normalizedBankSearchQuery],
  );
};
