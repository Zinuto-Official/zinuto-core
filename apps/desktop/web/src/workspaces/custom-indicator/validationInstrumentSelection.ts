// SPDX-License-Identifier: GPL-3.0-only

import type {
  CustomIndicatorValidationFacts,
  CustomIndicatorValidationInstrumentFact,
} from "@/workspaces/custom-indicator/customIndicatorWorkspaceReadModelUi";

export const normalizeValidationInstrumentSymbol = (value: string): string =>
  String(value || "").trim().toUpperCase();

export const selectValidationInstrumentFromFacts = ({
  facts,
  samplePoolId,
  symbol,
}: {
  facts: CustomIndicatorValidationFacts;
  samplePoolId: string;
  symbol: string;
}): CustomIndicatorValidationInstrumentFact | null => {
  const normalizedPoolId = String(samplePoolId || "").trim() || facts.allPoolId;
  const normalizedSymbol = normalizeValidationInstrumentSymbol(symbol);
  if (!normalizedSymbol) {
    return null;
  }
  return (
    facts.instruments.find(
      (instrument) =>
        instrument.symbol === normalizedSymbol &&
        instrument.samplePoolIds.includes(normalizedPoolId),
    ) ??
    facts.instruments.find(
      (instrument) => instrument.symbol === normalizedSymbol,
    ) ??
    null
  );
};
