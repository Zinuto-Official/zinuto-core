// SPDX-License-Identifier: GPL-3.0-only

import type { ApiRequestOptions, ApiRequester } from "@/api/requesterTypes";
import { DESKTOP_LOCAL_API_ROUTES } from "@zinuto/shared/contracts-desktop/http-api";
import type {
  ApiChallengeStatsProjectDetail,
  ApiSpecialTrainingAssetClass,
  ApiSpecialTrainingBank,
  ApiSpecialTrainingBankEditorReadModel,
  ApiSpecialTrainingBankEditorReadModelRequest,
  ApiSpecialTrainingBankPage,
  ApiSpecialTrainingBankScopeSummary,
  ApiSpecialTrainingChallenge,
  ApiSpecialTrainingChallengeActivityResult,
  ApiSpecialTrainingChallengeCommandResult,
  ApiSpecialTrainingChallengeDiscardResult,
  ApiSpecialTrainingChallengeProgress,
  ApiSpecialTrainingChallengeRuntime,
  ApiSpecialTrainingDurationEstimateRequest,
  ApiSpecialTrainingDurationEstimateResponse,
  ApiSpecialTrainingFastDecisionChoice,
  ApiSpecialTrainingFastDecisionStrictnessLevel,
  ApiSpecialTrainingHistoryQuestionDetail,
  ApiSpecialTrainingHistorySessionDetail,
  ApiSpecialTrainingHistorySessionListItem,
  ApiSpecialTrainingModeId,
  ApiSpecialTrainingOrderInputMode,
  ApiSpecialTrainingOrderPriceMode,
  ApiSpecialTrainingOrderQuote,
  ApiSpecialTrainingOrderQuotePayload,
  ApiSpecialTrainingQuestionBankDraftPreviewRequest,
  ApiSpecialTrainingQuestionBankSummary,
  ApiSpecialTrainingSettlement,
  ApiSpecialTrainingStatsPayload,
  ApiSpecialTrainingStatsSummary,
  ApiSpecialTrainingTradeAction,
} from "@/api/specialTrainingTypes";

export type * from "@/api/specialTrainingTypes";

export const createSpecialTrainingApi = (request: ApiRequester) => ({
  listSpecialTrainingBanks: (
    payload: {
      limit?: number;
      cursor?: string | null;
      keyword?: string;
    } = {},
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    params.set(
      "limit",
      String(Math.max(1, Math.floor(Number(payload.limit) || 30))),
    );
    const cursor = String(payload.cursor ?? "").trim();
    const keyword = String(payload.keyword ?? "").trim();
    if (cursor) {
      params.set("cursor", cursor);
    }
    if (keyword) {
      params.set("keyword", keyword);
    }
    return request<ApiSpecialTrainingBankPage>(
      `/api/v1/training/special/banks?${params.toString()}`,
      options,
    );
  },
  createSpecialTrainingBank: (
    payload: {
      name: string;
      assetClass: ApiSpecialTrainingAssetClass;
      targetTimeframe: "1m" | "5m" | "1h" | "1d";
      poolIds: string[];
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingBank>("/api/v1/training/special/banks", {
      method: "POST",
      body: JSON.stringify(payload),
      ...options,
    }),
  updateSpecialTrainingBank: (
    bankId: string,
    payload: {
      name: string;
      assetClass: ApiSpecialTrainingAssetClass;
      targetTimeframe: "1m" | "5m" | "1h" | "1d";
      poolIds: string[];
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingBank>(
      `/api/v1/training/special/banks/${encodeURIComponent(bankId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  deleteSpecialTrainingBank: (bankId: string, options?: ApiRequestOptions) =>
    request<{ bankId: string; deleted: boolean }>(
      `/api/v1/training/special/banks/${encodeURIComponent(bankId)}`,
      {
        method: "DELETE",
        ...options,
      },
    ),
  estimateSpecialTrainingDuration: (
    payload: ApiSpecialTrainingDurationEstimateRequest,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingDurationEstimateResponse>(
      "/api/v1/training/special/estimate",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  startSpecialTrainingChallenge: (
    payload: {
      bankId: string;
      modeId: ApiSpecialTrainingModeId;
      questionCount: number;
      horizonBars?: number;
      decisionSecondsLimit?: number;
      fastDecisionStrictnessLevel?: ApiSpecialTrainingFastDecisionStrictnessLevel;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingChallenge>(
      "/api/v1/training/special/challenges/start",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  discardSpecialTrainingChallenge: (
    challengeId: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingChallengeDiscardResult>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}`,
      {
        method: "DELETE",
        ...options,
      },
    ),
  getSpecialTrainingChallengeRuntime: (
    challengeId: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingChallengeRuntime>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}/runtime`,
      options,
    ),
  setSpecialTrainingChallengeActivity: (
    challengeId: string,
    paused: boolean,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingChallengeActivityResult>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}/activity`,
      {
        method: "PUT",
        body: JSON.stringify({ paused }),
        ...options,
      },
    ),
  getSpecialTrainingChallengeProgress: (
    challengeId: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingChallengeProgress>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}/progress`,
      options,
    ),
  getSpecialTrainingChallengeOrderQuote: (
    challengeId: string,
    payload: ApiSpecialTrainingOrderQuotePayload,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingOrderQuote>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}/order/quote`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  executeSpecialTrainingChallengeAction: (
    challengeId: string,
    payload: {
      action:
        | "BUY"
        | "SELL"
        | "BUY_AND_ADVANCE"
        | "SELL_AND_ADVANCE"
        | "NEXT_BAR"
        | "UNDO";
      inputMode?: ApiSpecialTrainingOrderInputMode;
      lotInput?: string | number | null;
      amountInput?: string | number | null;
      ratioInput?: string | number | null;
      priceMode?: ApiSpecialTrainingOrderPriceMode;
      nextOpenDelayBars?: number;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingChallengeCommandResult>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}/actions`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  submitSpecialTrainingChallengeDecision: (
    challengeId: string,
    payload: {
      selection: ApiSpecialTrainingFastDecisionChoice;
      decisionSecondsUsed?: number;
      timedOut?: boolean;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingChallengeCommandResult>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}/decision`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  previewSpecialTrainingQuestionBank: (
    payload: {
      bankId: string;
      modeId: ApiSpecialTrainingModeId;
      horizonBars?: number;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingQuestionBankSummary>(
      "/api/v1/training/special/question-bank/preview",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  previewSpecialTrainingQuestionBankDraft: (
    payload: ApiSpecialTrainingQuestionBankDraftPreviewRequest,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingBankScopeSummary>(
      "/api/v1/training/special/question-bank/draft-preview",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  getSpecialTrainingBankEditorReadModel: (
    payload: ApiSpecialTrainingBankEditorReadModelRequest,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingBankEditorReadModel>(
      DESKTOP_LOCAL_API_ROUTES.trainingSpecialBankEditorReadModel,
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  resetSpecialTrainingQuestionBank: (
    payload: {
      bankId: string;
      modeId: ApiSpecialTrainingModeId;
      horizonBars?: number;
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingQuestionBankSummary>(
      "/api/v1/training/special/question-bank/reset",
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  settleSpecialTrainingQuestion: (
    challengeId: string,
    questionId: string,
    payload: {
      abandoned?: boolean;
      cursorIndex?: number;
      fastDecision?: {
        selection: ApiSpecialTrainingFastDecisionChoice;
        decisionSecondsUsed: number;
        timedOut?: boolean;
      };
      tradeActions?: ApiSpecialTrainingTradeAction[];
    },
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingSettlement>(
      `/api/v1/training/special/challenges/${encodeURIComponent(challengeId)}/questions/${encodeURIComponent(questionId)}/settle`,
      {
        method: "POST",
        body: JSON.stringify(payload),
        ...options,
      },
    ),
  listSpecialTrainingHistorySessions: (
    filters?: {
      modeId?: ApiSpecialTrainingModeId;
      limit?: number;
    },
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    if (filters?.modeId) {
      params.set("modeId", filters.modeId);
    }
    if (Number.isFinite(Number(filters?.limit))) {
      params.set(
        "limit",
        String(Math.max(1, Math.floor(Number(filters?.limit)))),
      );
    }
    const query = params.toString();
    return request<ApiSpecialTrainingHistorySessionListItem[]>(
      `/api/v1/training/special/history${query ? `?${query}` : ""}`,
      options,
    );
  },
  getSpecialTrainingHistorySession: (
    sessionId: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingHistorySessionDetail>(
      `/api/v1/training/special/history/${encodeURIComponent(sessionId)}`,
      options,
    ),
  getSpecialTrainingHistoryQuestionDetail: (
    questionId: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiSpecialTrainingHistoryQuestionDetail>(
      `/api/v1/training/special/history/questions/${encodeURIComponent(questionId)}`,
      options,
    ),
  getSpecialTrainingStats: (
    filters: {
      modeId: ApiSpecialTrainingModeId;
      from?: string;
      to?: string;
      symbol?: string;
      timeframe?: "1m" | "5m" | "1h" | "1d";
      profitability?: "ALL" | "PROFIT" | "LOSS";
      limit?: number;
      detailId?: string;
      includeProjectDetails?: boolean;
    },
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    params.set("modeId", filters.modeId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.symbol) params.set("symbol", filters.symbol);
    if (filters.timeframe) params.set("timeframe", filters.timeframe);
    if (filters.profitability) {
      params.set("profitability", filters.profitability);
    }
    if (Number.isFinite(Number(filters.limit))) {
      params.set(
        "limit",
        String(Math.max(1, Math.floor(Number(filters.limit)))),
      );
    }
    if (filters.detailId) {
      params.set("detailId", filters.detailId);
    }
    if (typeof filters.includeProjectDetails === "boolean") {
      params.set(
        "includeProjectDetails",
        String(filters.includeProjectDetails),
      );
    }
    return request<ApiSpecialTrainingStatsPayload>(
      `/api/v1/training/special/stats?${params.toString()}`,
      options,
    );
  },
  getSpecialTrainingStatsSummary: (
    filters: {
      modeId: ApiSpecialTrainingModeId;
      from?: string;
      to?: string;
      symbol?: string;
      timeframe?: "1m" | "5m" | "1h" | "1d";
      profitability?: "ALL" | "PROFIT" | "LOSS";
      limit?: number;
    },
    options?: ApiRequestOptions,
  ) => {
    const params = new URLSearchParams();
    params.set("modeId", filters.modeId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.symbol) params.set("symbol", filters.symbol);
    if (filters.timeframe) params.set("timeframe", filters.timeframe);
    if (filters.profitability) {
      params.set("profitability", filters.profitability);
    }
    if (Number.isFinite(Number(filters.limit))) {
      params.set(
        "limit",
        String(Math.max(1, Math.floor(Number(filters.limit)))),
      );
    }
    return request<ApiSpecialTrainingStatsSummary>(
      `/api/v1/training/special/stats/summary?${params.toString()}`,
      options,
    );
  },
  getSpecialTrainingStatsProjectDetail: (
    projectId: string,
    options?: ApiRequestOptions,
  ) =>
    request<ApiChallengeStatsProjectDetail | null>(
      `/api/v1/training/special/stats/details/${encodeURIComponent(projectId)}`,
      options,
    ),
  clearSpecialTrainingHistory: (
    payload: { modeId?: ApiSpecialTrainingModeId } = {},
  ) =>
    request<{
      deletedSessionRows: number;
      deletedQuestionRows: number;
    }>("/api/v1/training/special/history/clear", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
});
