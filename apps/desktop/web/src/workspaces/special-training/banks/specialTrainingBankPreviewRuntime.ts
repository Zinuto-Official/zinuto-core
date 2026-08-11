// SPDX-License-Identifier: GPL-3.0-only

import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { ApiSpecialTrainingBank } from "@/api";
import type { SpecialTrainingBankEditorDraft } from "@/workspaces/special-training/specialTrainingBankEditorModel";
import {
  getSpecialTrainingBankEditorReadModel,
} from "@/workspaces/special-training/services/specialTrainingApiService";
import {
  type BankCardPreviewState,
  type NormalizedEnabledSamplePool,
} from "@/workspaces/special-training/banks/specialTrainingBankManagerTypes";
import { resolveAssetClassForPoolIds } from "@/workspaces/special-training/banks/specialTrainingBankPoolHelpers";
import {
  createPendingSpecialTrainingBankEditorReadModel,
  type SpecialTrainingBankEditorReadModel,
} from "@/workspaces/special-training/banks/specialTrainingBankEditorReadModel";

export const useSpecialTrainingBankCardPreviews = ({
  specialTrainingBanks,
  enabledSamplePoolById,
}: {
  specialTrainingBanks: ApiSpecialTrainingBank[];
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>;
}) => {
  const [bankCardPreviewById, setBankCardPreviewById] = useState<
    Record<string, BankCardPreviewState>
  >({});

  useEffect(() => {
    if (!specialTrainingBanks.length) {
      setBankCardPreviewById({});
      return;
    }
    setBankCardPreviewById(
      Object.fromEntries(
        specialTrainingBanks.map((bank) => {
          const missingPoolIds = bank.scope.poolIds.filter(
            (poolId) => !enabledSamplePoolById.has(poolId),
          );
          return [
            bank.id,
            {
              loading: false,
              errorMessage: "",
              summary: bank.scopeSummary,
              missingPoolIds:
                missingPoolIds.length > 0
                  ? missingPoolIds
                  : bank.scopeSummary.missingPoolIds,
            },
          ] satisfies [string, BankCardPreviewState];
        }),
      ),
    );
  }, [
    enabledSamplePoolById,
    specialTrainingBanks,
  ]);

  return bankCardPreviewById;
};

export const useSpecialTrainingBankEditorReadModel = ({
  isBankEditorOpen,
  bankEditorStep,
  bankEditorDraft,
  bankEditorSelectedPoolIds,
  bankEditorAvailablePools,
  enabledSamplePoolById,
  resolveBankApiErrorMessage,
}: {
  isBankEditorOpen: boolean;
  bankEditorStep: "CONFIG" | "PREVIEW";
  bankEditorDraft: SpecialTrainingBankEditorDraft | null;
  bankEditorSelectedPoolIds: string[];
  bankEditorAvailablePools: NormalizedEnabledSamplePool[];
  enabledSamplePoolById: ReadonlyMap<string, NormalizedEnabledSamplePool>;
  resolveBankApiErrorMessage: (error: unknown) => string;
}): {
  readModel: SpecialTrainingBankEditorReadModel;
  previewState: BankCardPreviewState;
  setErrorMessage: (message: string) => void;
} => {
  const [readModel, setReadModel] =
    useState<SpecialTrainingBankEditorReadModel>(() =>
      createPendingSpecialTrainingBankEditorReadModel(bankEditorStep),
    );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const bankEditorReadModelRequestRef = useRef(0);
  const bankEditorReadModelAbortControllerRef = useRef<AbortController | null>(
    null,
  );

  useEffect(() => {
    if (!isBankEditorOpen || !bankEditorDraft) {
      bankEditorReadModelAbortControllerRef.current?.abort();
      bankEditorReadModelAbortControllerRef.current = null;
      setLoading(false);
      setErrorMessage("");
      setReadModel(createPendingSpecialTrainingBankEditorReadModel(bankEditorStep));
      return;
    }
    const requestVersion = bankEditorReadModelRequestRef.current + 1;
    bankEditorReadModelRequestRef.current = requestVersion;
    bankEditorReadModelAbortControllerRef.current?.abort();
    const abortController = new AbortController();
    bankEditorReadModelAbortControllerRef.current = abortController;
    setLoading(true);
    setErrorMessage("");
    setReadModel(createPendingSpecialTrainingBankEditorReadModel(bankEditorStep));
    void (async () => {
      try {
        const nextReadModel = await getSpecialTrainingBankEditorReadModel({
          step: bankEditorStep,
          draft: {
            sourceBankId: bankEditorDraft.sourceBankId,
            name: bankEditorDraft.name,
            assetClass: resolveAssetClassForPoolIds(
              bankEditorSelectedPoolIds,
              enabledSamplePoolById,
            ),
            targetTimeframe: bankEditorDraft.targetTimeframe,
            poolIds: bankEditorSelectedPoolIds,
          },
          availablePoolIds: bankEditorAvailablePools.map((pool) => pool.id),
        }, { signal: abortController.signal });
        if (bankEditorReadModelRequestRef.current !== requestVersion) {
          return;
        }
        setReadModel(nextReadModel);
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }
        if (bankEditorReadModelRequestRef.current !== requestVersion) {
          return;
        }
        setReadModel(createPendingSpecialTrainingBankEditorReadModel(bankEditorStep));
        setErrorMessage(resolveBankApiErrorMessage(error));
      } finally {
        if (bankEditorReadModelRequestRef.current === requestVersion) {
          setLoading(false);
        }
      }
    })();
    return () => {
      abortController.abort();
    };
  }, [
    bankEditorAvailablePools,
    bankEditorDraft,
    bankEditorSelectedPoolIds,
    bankEditorStep,
    enabledSamplePoolById,
    isBankEditorOpen,
    resolveBankApiErrorMessage,
  ]);

  return {
    readModel,
    previewState: {
      loading,
      errorMessage,
      summary: readModel.facts.scopeSummary,
      missingPoolIds: readModel.facts.scopeSummary?.missingPoolIds ?? [],
    },
    setErrorMessage,
  };
};
