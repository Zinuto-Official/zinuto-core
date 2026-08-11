// SPDX-License-Identifier: GPL-3.0-only

import { assertLocalImportOperationalAccessForSources } from './accessPolicy.js';
import type { LocalDataSourceSummary } from './types.js';

type OperationAccessErrorFactory = (
  code: string,
  args?: Record<string, string | number | boolean | null>,
  status?: number,
) => Error;

export const createLocalImportOperationGate = ({
  listLocalDataSources,
  appError,
}: {
  listLocalDataSources: () => Promise<LocalDataSourceSummary[]>;
  appError: OperationAccessErrorFactory;
}): ((sourceIdRaw?: string) => Promise<void>) =>
  async (sourceIdRaw?: string): Promise<void> => {
    assertLocalImportOperationalAccessForSources({
      sourceIdRaw,
      sources: await listLocalDataSources(),
      appError,
    });
  };
