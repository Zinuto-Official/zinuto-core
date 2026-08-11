// SPDX-License-Identifier: GPL-3.0-only

type SpecialTrainingContent = {
  riskDisciplineActionReasonNoActiveQuestion: string;
  riskDisciplineActionReasonNoActionableBars: string;
  riskDisciplineActionReasonPriceUnavailable: string;
  riskDisciplineActionReasonBuyingPowerEmpty: string;
  riskDisciplineActionReasonPositionEmpty: string;
  riskDisciplineActionReasonEntryLimitReached: string;
  riskDisciplineActionReasonQuantityZero: string;
  riskDisciplineActionReasonUndoEmpty: string;
};

export const resolveSpecialTrainingRiskActionReasonText = (
  content: SpecialTrainingContent,
  code: string | null,
  fallbackReason: string | null = null,
): string | null => {
  switch (code) {
    case "NO_ACTIVE_QUESTION":
      return content.riskDisciplineActionReasonNoActiveQuestion;
    case "NO_ACTIONABLE_BARS":
      return content.riskDisciplineActionReasonNoActionableBars;
    case "PRICE_UNAVAILABLE":
      return content.riskDisciplineActionReasonPriceUnavailable;
    case "BUYING_POWER_EMPTY":
      return content.riskDisciplineActionReasonBuyingPowerEmpty;
    case "POSITION_EMPTY":
      return content.riskDisciplineActionReasonPositionEmpty;
    case "ENTRY_LIMIT_REACHED":
      return content.riskDisciplineActionReasonEntryLimitReached;
    case "QUANTITY_ZERO":
      return content.riskDisciplineActionReasonQuantityZero;
    case "UNDO_EMPTY":
      return content.riskDisciplineActionReasonUndoEmpty;
    default:
      return fallbackReason;
  }
};
