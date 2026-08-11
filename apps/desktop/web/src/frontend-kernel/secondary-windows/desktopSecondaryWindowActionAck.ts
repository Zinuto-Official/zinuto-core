// SPDX-License-Identifier: GPL-3.0-only

export type DesktopSecondaryWindowActionAckStatus = "ACCEPTED" | "REJECTED";

export type DesktopSecondaryWindowActionAckCode =
  | "ACTION_ACCEPTED"
  | "ACTION_BLOCKED"
  | "ACTION_REJECTED"
  | "ACK_LISTENER_FAILED"
  | "ACK_TIMEOUT"
  | "DELIVERY_FAILED"
  | "DUPLICATE_ACTION"
  | "INVALID_REQUEST"
  | "STALE_REVISION";

export type DesktopSecondaryWindowActionRequestIdentity = {
  kind: string;
  action: string;
  instanceId?: string;
  requestId: string;
  stateRevision?: number | null;
};

export type DesktopSecondaryWindowActionAck =
  DesktopSecondaryWindowActionRequestIdentity & {
    status: DesktopSecondaryWindowActionAckStatus;
    code: DesktopSecondaryWindowActionAckCode;
    reason?: string;
  };

type WaitForDesktopSecondaryWindowActionAckOptions = {
  request: DesktopSecondaryWindowActionRequestIdentity;
  subscribe: (
    handler: (ack: DesktopSecondaryWindowActionAck) => void,
  ) => Promise<() => void>;
  send: () => Promise<void>;
  timeoutMs: number;
};

export const retryDesktopSecondaryWindowActionAckDelivery = async ({
  send,
  retryDelaysMs = [50, 150, 350],
  wait = (delayMs: number) =>
    new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, delayMs);
    }),
}: {
  send: () => Promise<void>;
  retryDelaysMs?: number[];
  wait?: (delayMs: number) => Promise<void>;
}): Promise<void> => {
  let lastError: unknown = new Error("DESKTOP_SECONDARY_ACK_DELIVERY_FAILED");
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      await send();
      return;
    } catch (error) {
      lastError = error;
      const retryDelayMs = retryDelaysMs[attempt];
      if (retryDelayMs === undefined) {
        break;
      }
      await wait(Math.max(0, Math.floor(Number(retryDelayMs)) || 0));
    }
  }
  throw lastError;
};

const normalizeRevision = (value: number | null | undefined): number => {
  const revision = Math.floor(Number(value));
  return Number.isFinite(revision) && revision > 0 ? revision : 0;
};

const normalizeIdentityPart = (value: unknown): string =>
  String(value ?? "").trim();

export const createDesktopSecondaryWindowActionRequestId = (): string => {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) {
    return randomUuid;
  }
  return `secondary-action-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
};

export const isDesktopSecondaryWindowActionRequestRevisionCurrent = (
  requestRevision: number | null | undefined,
  currentRevision: number | null | undefined,
): boolean => {
  const normalizedRequestRevision = normalizeRevision(requestRevision);
  const normalizedCurrentRevision = normalizeRevision(currentRevision);
  return (
    normalizedRequestRevision > 0 &&
    normalizedCurrentRevision > 0 &&
    normalizedRequestRevision === normalizedCurrentRevision
  );
};

export const doesDesktopSecondaryWindowActionAckMatchRequest = (
  ack: DesktopSecondaryWindowActionAck,
  request: DesktopSecondaryWindowActionRequestIdentity,
): boolean =>
  normalizeIdentityPart(ack.kind) === normalizeIdentityPart(request.kind) &&
  normalizeIdentityPart(ack.action) === normalizeIdentityPart(request.action) &&
  normalizeIdentityPart(ack.instanceId) ===
    normalizeIdentityPart(request.instanceId) &&
  normalizeIdentityPart(ack.requestId) ===
    normalizeIdentityPart(request.requestId) &&
  normalizeRevision(ack.stateRevision) ===
    normalizeRevision(request.stateRevision);

const buildRequestKey = (
  request: DesktopSecondaryWindowActionRequestIdentity,
): string =>
  [
    normalizeIdentityPart(request.kind),
    normalizeIdentityPart(request.instanceId),
    normalizeIdentityPart(request.action),
    normalizeRevision(request.stateRevision),
    normalizeIdentityPart(request.requestId),
  ].join(":");

const buildActionKey = (
  request: DesktopSecondaryWindowActionRequestIdentity,
): string =>
  [
    normalizeIdentityPart(request.kind),
    normalizeIdentityPart(request.instanceId),
    normalizeRevision(request.stateRevision),
    normalizeIdentityPart(request.action),
  ].join(":");

export const createDesktopSecondaryWindowActionAckLedger = (
  maxEntries = 128,
) => {
  const ackByRequestKey = new Map<string, DesktopSecondaryWindowActionAck>();
  const acceptedAckByActionKey = new Map<
    string,
    DesktopSecondaryWindowActionAck
  >();

  const trim = () => {
    const boundedSize = Math.max(8, Math.floor(Number(maxEntries)) || 128);
    while (ackByRequestKey.size > boundedSize) {
      const oldestKey = ackByRequestKey.keys().next().value;
      if (typeof oldestKey !== "string") {
        break;
      }
      ackByRequestKey.delete(oldestKey);
    }
    while (acceptedAckByActionKey.size > boundedSize) {
      const oldestKey = acceptedAckByActionKey.keys().next().value;
      if (typeof oldestKey !== "string") {
        break;
      }
      acceptedAckByActionKey.delete(oldestKey);
    }
  };

  return {
    findByRequest: (
      request: DesktopSecondaryWindowActionRequestIdentity,
    ): DesktopSecondaryWindowActionAck | null =>
      ackByRequestKey.get(buildRequestKey(request)) ?? null,
    findAcceptedByAction: (
      request: DesktopSecondaryWindowActionRequestIdentity,
    ): DesktopSecondaryWindowActionAck | null =>
      acceptedAckByActionKey.get(buildActionKey(request)) ?? null,
    replayAcceptedForRequest: (
      request: DesktopSecondaryWindowActionRequestIdentity,
    ): DesktopSecondaryWindowActionAck | null => {
      const acceptedAck = acceptedAckByActionKey.get(buildActionKey(request));
      return acceptedAck
        ? {
            ...request,
            status: "ACCEPTED",
            code: "DUPLICATE_ACTION",
          }
        : null;
    },
    remember: (ack: DesktopSecondaryWindowActionAck): void => {
      ackByRequestKey.set(buildRequestKey(ack), ack);
      if (ack.status === "ACCEPTED") {
        acceptedAckByActionKey.set(buildActionKey(ack), ack);
      }
      trim();
    },
  };
};

const buildLocalRejection = (
  request: DesktopSecondaryWindowActionRequestIdentity,
  code: Extract<
    DesktopSecondaryWindowActionAckCode,
    "ACK_LISTENER_FAILED" | "ACK_TIMEOUT" | "DELIVERY_FAILED"
  >,
): DesktopSecondaryWindowActionAck => ({
  ...request,
  status: "REJECTED",
  code,
});

export const waitForDesktopSecondaryWindowActionAck = async ({
  request,
  subscribe,
  send,
  timeoutMs,
}: WaitForDesktopSecondaryWindowActionAckOptions): Promise<DesktopSecondaryWindowActionAck> => {
  let unsubscribe: () => void = () => undefined;
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  let resolveAck: ((ack: DesktopSecondaryWindowActionAck) => void) | null =
    null;
  const ackPromise = new Promise<DesktopSecondaryWindowActionAck>((resolve) => {
    resolveAck = resolve;
  });

  try {
    unsubscribe = await subscribe((ack) => {
      if (doesDesktopSecondaryWindowActionAckMatchRequest(ack, request)) {
        resolveAck?.(ack);
      }
    });
  } catch {
    return buildLocalRejection(request, "ACK_LISTENER_FAILED");
  }

  const normalizedTimeoutMs = Math.max(1, Math.floor(Number(timeoutMs)) || 1);
  timeoutId = globalThis.setTimeout(() => {
    resolveAck?.(buildLocalRejection(request, "ACK_TIMEOUT"));
  }, normalizedTimeoutMs);

  try {
    try {
      await send();
    } catch {
      return buildLocalRejection(request, "DELIVERY_FAILED");
    }
    return await ackPromise;
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
    unsubscribe();
  }
};
