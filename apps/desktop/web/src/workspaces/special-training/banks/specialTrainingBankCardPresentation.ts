// SPDX-License-Identifier: GPL-3.0-only

import type { ApiSpecialTrainingBank } from "@/api";
import { formatMessage } from "@zinuto/shared/i18n";
import type { AppUiLanguage } from "@/ui/config/uiConfig";
import type {
  BankCardPreviewState,
  NormalizedEnabledSamplePool,
} from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";

export const resolveSpecialTrainingBankCardPresentation = ({
  bank,
  previewState,
  language,
}: {
  bank: ApiSpecialTrainingBank;
  previewState: BankCardPreviewState;
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>;
  language: AppUiLanguage;
}) => {
  const summary = previewState.summary ?? bank.scopeSummary;
  const status = (() => {
    if (previewState.loading) {
      return {
        label: formatMessage(
          language,
          "trainer.specialTrainingBanks.statusLoading",
        ),
        tone: "loading" as const,
      };
    }
    if (previewState.errorMessage) {
      return {
        label: formatMessage(
          language,
          "trainer.specialTrainingBanks.statusError",
        ),
        tone: "danger" as const,
      };
    }
    if (previewState.missingPoolIds.length > 0) {
      return {
        label: formatMessage(
          language,
          "trainer.specialTrainingBanks.statusRepair",
        ),
        tone: "danger" as const,
      };
    }
    if (summary.status === "READY") {
      return {
        label: formatMessage(
          language,
          "trainer.specialTrainingBanks.statusReady",
        ),
        tone: "ready" as const,
      };
    }
    if (summary.status === "EMPTY") {
      return {
        label: formatMessage(
          language,
          "trainer.specialTrainingBanks.statusRepair",
        ),
        tone: "danger" as const,
      };
    }
    return {
      label: formatMessage(
        language,
        "trainer.specialTrainingBanks.statusRepair",
      ),
      tone: "danger" as const,
    };
  })();
  return {
    previewState,
    poolCount: summary.poolCount,
    symbolCount: summary.symbolCount,
    status,
  };
};
