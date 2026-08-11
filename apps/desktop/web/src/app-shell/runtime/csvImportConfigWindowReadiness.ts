// SPDX-License-Identifier: GPL-3.0-only

import type {
  CsvImportActionStartResult,
  CsvImportPreparationResult,
} from "@/app-shell/appCsvImportContracts";
import type {
  DesktopSecondaryWindowActionAck,
  DesktopSecondaryWindowActionRequestIdentity,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowActionAck";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";

export type PendingMarketDataImportHandoff = {
  abortController: AbortController;
  actionKey: string;
  originalRequestId: string;
  previewToken: string;
  requests: Map<string, DesktopSecondaryWindowActionRequestIdentity>;
  suppressAck: boolean;
};

export const getImportStartRejectionText = (
  result: Extract<CsvImportActionStartResult, { accepted: false }>,
  tt: (key: AppTextKey) => string,
): string => {
  if (String(result.reason || "").trim()) {
    return String(result.reason).trim();
  }
  switch (result.code) {
    case "CONFIGURATION_EXPIRED":
      return tt("appText.importConfigurationExpiredRescanFolder");
    case "IMPORT_BLOCKED":
    case "DUPLICATE_REQUEST":
      return tt("appText.systemProcessingWait");
    case "INVALID_FOLDER":
      return tt("appText.readFolder");
    case "VALIDATION_FAILED":
    default:
      return tt("appText.importPreviewFailed");
  }
};

export const buildTerminalActionKey = (
  request: DesktopSecondaryWindowActionRequestIdentity,
): string =>
  [
    request.kind,
    request.action,
    Math.floor(Number(request.stateRevision)) || 0,
  ].join(":");

export const buildTerminalRequestKey = (
  request: DesktopSecondaryWindowActionRequestIdentity,
): string => `${buildTerminalActionKey(request)}:${request.requestId}`;

export const createTerminalActionAckSender = ({
  closeMarketDataSource,
  fallbackFailureReason,
  kind,
  ledger,
  reportRejectedDeliveryFailure,
  sendAck,
}: {
  closeMarketDataSource: () => Promise<void>;
  fallbackFailureReason: string;
  kind: string;
  ledger: { remember: (ack: DesktopSecondaryWindowActionAck) => void };
  reportRejectedDeliveryFailure: (reason: string) => void;
  sendAck: (ack: DesktopSecondaryWindowActionAck) => Promise<void>;
}) => {
  const deliver = (ack: DesktopSecondaryWindowActionAck): void => {
    void sendAck(ack).catch(() => {
      if (kind !== "MARKET_DATA_ACQUISITION") {
        return;
      }
      void closeMarketDataSource().catch(() => undefined);
      if (ack.status === "REJECTED") {
        reportRejectedDeliveryFailure(
          String(ack.reason || "").trim() || fallbackFailureReason,
        );
      }
    });
  };
  return {
    deliver,
    send: (
      targetRequest: DesktopSecondaryWindowActionRequestIdentity,
      status: DesktopSecondaryWindowActionAck["status"],
      code: DesktopSecondaryWindowActionAck["code"],
      reason?: string,
    ): void => {
      const ack: DesktopSecondaryWindowActionAck = {
        ...targetRequest,
        status,
        code,
        ...(String(reason || "").trim()
          ? { reason: String(reason).trim() }
          : {}),
      };
      ledger.remember(ack);
      deliver(ack);
    },
  };
};

export const beginCsvImportConfigWindowVisibilityGate = (
  revision: number,
  acceptRevision: (revision: number) => void,
  waitForVisibleReady: (revision: number) => Promise<number | void>,
): Promise<number> => {
  acceptRevision(revision);
  return waitForVisibleReady(revision).then(
    (readyRevision) => readyRevision ?? revision,
  );
};

export const waitForAcceptedMarketDataImportHandoff = async ({
  completion,
  failureReason,
  isActive,
  onPreviewPrepared,
  waitForConfigWindow,
}: {
  completion: Promise<CsvImportPreparationResult>;
  failureReason: string;
  isActive: () => boolean;
  onPreviewPrepared: (
    preparation: Extract<CsvImportPreparationResult, { ready: true }>,
  ) => void;
  waitForConfigWindow: (previewToken: string) => Promise<number>;
}): Promise<Extract<CsvImportPreparationResult, { ready: true }> | null> => {
  const preparation = await completion;
  if (!isActive()) {
    return null;
  }
  if (!preparation.ready) {
    throw new Error(String(preparation.reason || "").trim() || failureReason);
  }
  onPreviewPrepared(preparation);
  await waitForConfigWindow(preparation.previewToken);
  return isActive() ? preparation : null;
};

type ReadinessEntry = {
  promise: Promise<number>;
  resolve: (revision: number) => void;
  reject: (error: Error) => void;
  settled: boolean;
};

const normalizePreviewToken = (value: unknown): string =>
  String(value ?? "").trim();

export const createCsvImportConfigWindowReadinessRegistry = () => {
  const entries = new Map<string, ReadinessEntry>();

  const ensure = (previewTokenRaw: unknown): ReadinessEntry => {
    const previewToken = normalizePreviewToken(previewTokenRaw);
    const existing = entries.get(previewToken);
    if (existing) {
      return existing;
    }
    let resolvePromise: (revision: number) => void = () => undefined;
    let rejectPromise: (error: Error) => void = () => undefined;
    const promise = new Promise<number>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    void promise.catch(() => undefined);
    const entry: ReadinessEntry = {
      promise,
      settled: false,
      resolve: (revision) => {
        if (entry.settled) {
          return;
        }
        entry.settled = true;
        resolvePromise(revision);
      },
      reject: (error) => {
        if (entry.settled) {
          return;
        }
        entry.settled = true;
        rejectPromise(error);
      },
    };
    entries.set(previewToken, entry);
    return entry;
  };

  return {
    wait: (previewToken: unknown): Promise<number> =>
      ensure(previewToken).promise,
    resolve: (previewToken: unknown, revision: number): void => {
      ensure(previewToken).resolve(revision);
    },
    reject: (previewToken: unknown, error: Error): void => {
      const normalized = normalizePreviewToken(previewToken);
      if (!normalized) {
        return;
      }
      ensure(normalized).reject(error);
    },
    rejectExcept: (previewToken: unknown, error: Error): void => {
      const retainedToken = normalizePreviewToken(previewToken);
      entries.forEach((entry, token) => {
        if (token !== retainedToken) {
          entry.reject(error);
          entries.delete(token);
        }
      });
    },
    delete: (previewToken: unknown): void => {
      entries.delete(normalizePreviewToken(previewToken));
    },
  };
};
