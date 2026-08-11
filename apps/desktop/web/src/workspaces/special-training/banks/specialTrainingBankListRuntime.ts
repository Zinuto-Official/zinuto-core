// SPDX-License-Identifier: GPL-3.0-only
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { ApiSpecialTrainingBank } from "@/api";
import { listSpecialTrainingBanks } from "@/workspaces/special-training/services/specialTrainingApiService";
import { mergeSpecialTrainingBankPageItems } from "@/workspaces/special-training/banks/specialTrainingBankPoolHelpers";

const SPECIAL_TRAINING_BANK_LIST_PAGE_SIZE = 30;

type UseSpecialTrainingBankListRuntimeOptions = {
  bankSearchQuery: string;
  dataLoadFailedLabel: string;
  fallbackErrorMessage: string;
  resolveApiErrorMessage: (error: unknown) => string;
  setSubmitErrorMessage: Dispatch<SetStateAction<string>>;
  setBanks: Dispatch<SetStateAction<ApiSpecialTrainingBank[]>>;
  setNextCursor: Dispatch<SetStateAction<string | null>>;
  setTotal: Dispatch<SetStateAction<number>>;
  setIsLoadingMore: Dispatch<SetStateAction<boolean>>;
};

/**
 * Keeps question-bank paging current when a source's eligibility or content
 * changes. A new read always cancels the stale snapshot before it can publish.
 */
export const useSpecialTrainingBankListRuntime = ({
  bankSearchQuery,
  dataLoadFailedLabel,
  fallbackErrorMessage,
  resolveApiErrorMessage,
  setSubmitErrorMessage,
  setBanks,
  setNextCursor,
  setTotal,
  setIsLoadingMore,
}: UseSpecialTrainingBankListRuntimeOptions) => {
  const requestSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const refreshSpecialTrainingBanks = useCallback(
    async (options?: { append?: boolean; cursor?: string | null }) => {
      const append = Boolean(options?.append);
      const requestSeq = requestSeqRef.current + 1;
      requestSeqRef.current = requestSeq;
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoadingMore(false);
        setNextCursor(null);
      }
      try {
        const page = await listSpecialTrainingBanks(
          {
            limit: SPECIAL_TRAINING_BANK_LIST_PAGE_SIZE,
            cursor: options?.cursor ?? null,
            keyword: bankSearchQuery,
          },
          { signal: abortController.signal },
        );
        if (requestSeqRef.current !== requestSeq) {
          return;
        }
        setBanks((current) =>
          mergeSpecialTrainingBankPageItems({
            currentBanks: current,
            incomingBanks: Array.isArray(page.items) ? page.items : [],
            append,
          }),
        );
        setNextCursor(page.nextCursor ?? null);
        setTotal(Math.max(0, Math.floor(Number(page.total) || 0)));
        setSubmitErrorMessage((current) =>
          current === dataLoadFailedLabel || current === fallbackErrorMessage
            ? ""
            : current,
        );
      } catch (error) {
        if (abortController.signal.aborted || requestSeqRef.current !== requestSeq) {
          return;
        }
        setSubmitErrorMessage(resolveApiErrorMessage(error));
      } finally {
        if (requestSeqRef.current === requestSeq && append) {
          setIsLoadingMore(false);
        }
      }
    },
    [
      bankSearchQuery,
      dataLoadFailedLabel,
      fallbackErrorMessage,
      resolveApiErrorMessage,
      setBanks,
      setIsLoadingMore,
      setNextCursor,
      setSubmitErrorMessage,
      setTotal,
    ],
  );

  return { refreshSpecialTrainingBanks };
};
