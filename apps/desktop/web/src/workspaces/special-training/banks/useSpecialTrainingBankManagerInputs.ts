// SPDX-License-Identifier: GPL-3.0-only

import type { BaseTimeframe } from "@zinuto/shared/timeframe";
import { formatMessage } from "@zinuto/shared/i18n";
import { useCallback, useMemo } from "react";
import {
  formatSpecialTrainingBankTimeframeCode,
  formatSpecialTrainingBankTimeframeLabel,
  resolveSpecialTrainingBankApiErrorMessage,
} from "@/workspaces/special-training/specialTrainingBankUi";
import type {
  NormalizedEnabledSamplePool,
  UseSpecialTrainingBankManagerOptions,
} from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";
import {
  createEnabledSamplePoolById,
  normalizeEnabledSamplePools,
  normalizeEnabledSymbols,
  resolveDefaultCreateBankTargetTimeframe,
  resolveDefaultSelectedPoolIds,
} from "@/workspaces/special-training/banks/specialTrainingBankPoolHelpers";

export const useSpecialTrainingBankManagerInputs = ({
  language,
  enabledSamplePoolSymbols,
  enabledSamplePools,
}: Pick<
  UseSpecialTrainingBankManagerOptions,
  "language" | "enabledSamplePoolSymbols" | "enabledSamplePools"
>) => {
  const middleDotSymbol = formatMessage(language, "appText.message0664");
  const joinWithMiddleDot = useCallback(
    (parts: ReadonlyArray<string>) =>
      parts
        .map((part) => String(part || "").trim())
        .filter((part) => part.length > 0)
        .join(` ${middleDotSymbol} `),
    [middleDotSymbol],
  );
  const formatBankTimeframeLabel = useCallback(
    (timeframe: BaseTimeframe | null | undefined) =>
      formatSpecialTrainingBankTimeframeLabel(language, timeframe) ||
      formatSpecialTrainingBankTimeframeCode(timeframe),
    [language],
  );
  const bankListFallbackErrorMessage = useMemo(
    () => formatMessage(language, "trainer.questionBank.statusError"),
    [language],
  );
  const resolveBankApiErrorMessage = useCallback(
    (error: unknown) =>
      resolveSpecialTrainingBankApiErrorMessage({
        language,
        error,
        fallbackMessage: bankListFallbackErrorMessage,
      }),
    [bankListFallbackErrorMessage, language],
  );
  const normalizedEnabledSamplePools = useMemo<NormalizedEnabledSamplePool[]>(
    () => normalizeEnabledSamplePools(enabledSamplePools),
    [enabledSamplePools],
  );
  const enabledSamplePoolById = useMemo(
    () => createEnabledSamplePoolById(normalizedEnabledSamplePools),
    [normalizedEnabledSamplePools],
  );
  const defaultCreateBankTargetTimeframe = useMemo(
    () => resolveDefaultCreateBankTargetTimeframe(normalizedEnabledSamplePools),
    [normalizedEnabledSamplePools],
  );
  const defaultSelectedPoolIds = useMemo(
    () => resolveDefaultSelectedPoolIds(normalizedEnabledSamplePools),
    [normalizedEnabledSamplePools],
  );
  const normalizedEnabledSymbols = useMemo(
    () =>
      normalizeEnabledSymbols({
        enabledSamplePoolSymbols,
        normalizedEnabledSamplePools,
      }),
    [enabledSamplePoolSymbols, normalizedEnabledSamplePools],
  );
  const enabledSamplePoolRevision = useMemo(
    () =>
      normalizedEnabledSamplePools
        .map(
          (pool) =>
            `${pool.id}\u0000${pool.questionBankRevisionToken}\u0000${pool.instruments
              .map(
                (instrument) =>
                  `${instrument.instrumentId}\u0000${instrument.symbol}`,
              )
              .join("\u0001")}`,
        )
        .sort((left, right) => left.localeCompare(right, "en"))
        .join("\u0002"),
    [normalizedEnabledSamplePools],
  );

  return {
    bankListFallbackErrorMessage,
    defaultCreateBankTargetTimeframe,
    defaultSelectedPoolIds,
    enabledSamplePoolRevision,
    enabledSamplePoolById,
    formatBankTimeframeLabel,
    hasEnabledSampleSymbols: normalizedEnabledSymbols.length > 0,
    joinWithMiddleDot,
    normalizedEnabledSamplePools,
    resolveBankApiErrorMessage,
  };
};
