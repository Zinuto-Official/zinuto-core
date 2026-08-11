// SPDX-License-Identifier: GPL-3.0-only

import { formatMessage } from "@zinuto/shared/i18n";
import type { ApiSpecialTrainingQuestionBankSummary } from "../src/api";
import { api } from "../src/api";
import "../src/styles/index.css";
import "../src/styles/workspaces/strategy-backtest.css";
import "../src/workspaces/data/dataConfig/market-data-acquisition.css";

export const installI18nSpecialTrainingPreviewApi = ({
  page,
  language,
  previewSpecialTrainingSamplePools,
}: {
  page: string;
  language: import("../src/ui/config/uiConfig").AppUiLanguage;
  previewSpecialTrainingSamplePools: Array<{
    id: string;
    instruments: ReadonlyArray<unknown>;
    symbols: ReadonlyArray<string>;
  }>;
}): void => {
  if (page === "SPECIAL_TRAINING") {
    const now = "2026-04-20T08:00:00.000Z";
    const previewBankName = formatMessage(
      language,
      "trainer.specialTrainingBanks.defaultNameTemplate",
      { index: 5 },
    );
    const previewBankScopeSummary = {
      status: "READY" as const,
      poolCount: previewSpecialTrainingSamplePools.length,
      instrumentCount: previewSpecialTrainingSamplePools.reduce(
        (total, pool) => total + pool.instruments.length,
        0,
      ),
      symbolCount: Array.from(
        new Set(
          previewSpecialTrainingSamplePools.flatMap((pool) => pool.symbols),
        ),
      ).length,
      sourceTimeframes: ["1d" as const],
      definitionHash: "preview-bank-scope",
      missingPoolIds: [],
      maxSourceTimeframe: "1d" as const,
    };
    const previewBanks: Awaited<
      ReturnType<typeof api.listSpecialTrainingBanks>
    >["items"] = [
      {
        id: "preview-bank-ready",
        name: previewBankName,
        assetClass: "STOCK",
        targetTimeframe: "1d",
        scope: {
          poolIds: previewSpecialTrainingSamplePools.map((pool) => pool.id),
        },
        scopeSummary: previewBankScopeSummary,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "preview-bank-low",
        name: formatMessage(
          language,
          "trainer.specialTrainingBanks.defaultNameTemplate",
          { index: 4 },
        ),
        assetClass: "STOCK",
        targetTimeframe: "1d",
        scope: {
          poolIds: previewSpecialTrainingSamplePools.map((pool) => pool.id),
        },
        scopeSummary: previewBankScopeSummary,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const buildPreviewBankSummary = ({
      bank,
      modeId,
    }: {
      bank: (typeof previewBanks)[number];
      modeId: ApiSpecialTrainingQuestionBankSummary["modeId"];
    }): ApiSpecialTrainingQuestionBankSummary => {
      const isLowBank = bank.id === "preview-bank-low";
      return {
        bankId: bank.id,
        bankName: bank.name,
        modeId,
        scopeHash: `${bank.id}:${modeId}:preview`,
        status: isLowBank ? "READY_IN_PROGRESS" : "READY_FRESH",
        targetTimeframe: bank.targetTimeframe,
        effectiveTimeframe: bank.targetTimeframe,
        effectiveTimeframes: [bank.targetTimeframe],
        minimumBaseTimeframe: bank.targetTimeframe,
        sourceTimeframe: bank.targetTimeframe,
        sourceTimeframes: [bank.targetTimeframe],
        poolCount: bank.scope.poolIds.length,
        instrumentCount: previewSpecialTrainingSamplePools.reduce(
          (total, pool) => total + pool.instruments.length,
          0,
        ),
        totalQuestionCount: isLowBank ? 8 : 196,
        completedQuestionCount: isLowBank ? 6 : 0,
        remainingQuestionCount: isLowBank ? 2 : 196,
        symbolCount: previewSpecialTrainingSamplePools.reduce(
          (total, pool) => total + pool.symbols.length,
          0,
        ),
        availableQuestionCount: isLowBank ? 2 : 196,
        builtQuestionCount: isLowBank ? 6 : 0,
        capacity: {
          requestedQuestionCount: 20,
          hasCapacityForRun: !isLowBank,
          willRestartQuestionScope: false,
          totalQuestionCount: isLowBank ? 8 : 196,
          availableQuestionCount: isLowBank ? 2 : 196,
        },
        actionAvailability: {
          start: {
            enabled: !isLowBank,
            reasonCode: isLowBank ? "INSUFFICIENT_AVAILABLE_QUESTIONS" : null,
            hasCapacityForRun: !isLowBank,
            willRestartQuestionScope: false,
          },
          reset: {
            enabled: isLowBank,
            reasonCode: null,
            hasProgress: isLowBank,
          },
        },
        runtimeState: {
          status: isLowBank ? "READY_IN_PROGRESS" : "READY_FRESH",
          noticeKind: null,
          noticeReasonCode: null,
          shouldAppendOldProgressNotice: false,
          sessionUsesOldSnapshot: false,
        },
        updatedAt: now,
        expiresAt: null,
      };
    };
    api.listSpecialTrainingBanks = async () => ({
      items: previewBanks,
      nextCursor: null,
      total: previewBanks.length,
    });
    api.previewSpecialTrainingQuestionBank = async ({ bankId, modeId }) => {
      const bank =
        previewBanks.find((item) => item.id === bankId) ?? previewBanks[0];
      return buildPreviewBankSummary({ bank, modeId });
    };
    api.resetSpecialTrainingQuestionBank = async ({ bankId, modeId }) => {
      const bank =
        previewBanks.find((item) => item.id === bankId) ?? previewBanks[0];
      return buildPreviewBankSummary({ bank, modeId });
    };
    api.deleteSpecialTrainingBank = async (bankId) => ({
      bankId,
      deleted: true,
    });
  }
};
