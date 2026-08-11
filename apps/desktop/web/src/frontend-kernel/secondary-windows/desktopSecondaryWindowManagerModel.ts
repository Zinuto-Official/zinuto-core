// SPDX-License-Identifier: GPL-3.0-only

export type DesktopSecondaryWindowStateRecord<
  Kind extends string = string,
  VisualContext = unknown,
> = {
  kind: Kind;
  title: string;
  payload: unknown;
  instanceId: string;
  intentGeneration: number;
  revision: number;
  visualContext: VisualContext | null;
};

export type DesktopSecondaryWindowIntent<Kind extends string = string> = {
  kind: Kind;
  instanceId: string;
  generation: number;
};

export type DesktopSecondaryWindowOpenPlan<
  Kind extends string = string,
  VisualContext = unknown,
> = {
  state: DesktopSecondaryWindowStateRecord<Kind, VisualContext>;
  shouldCreateWindow: boolean;
  shouldFocusWindow: boolean;
  shouldShowSkeletonImmediately: boolean;
  shouldSyncStateImmediately: boolean;
};

type DesktopSecondaryWindowActionIdentity<Kind extends string> = {
  kind?: Kind;
  instanceId?: unknown;
  requestId?: unknown;
  stateRevision?: unknown;
};

let fallbackInstanceSequence = 0;

const createDefaultInstanceId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  fallbackInstanceSequence += 1;
  return `secondary-${Date.now().toString(36)}-${fallbackInstanceSequence.toString(36)}`;
};

const serializeVisualContext = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  return JSON.stringify(value) ?? "undefined";
};

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const hasValidStateIdentity = <Kind extends string, VisualContext>(
  state: DesktopSecondaryWindowStateRecord<Kind, VisualContext>,
): boolean =>
  String(state.instanceId || "").trim().length > 0 &&
  isPositiveInteger(state.intentGeneration) &&
  isPositiveInteger(state.revision);

export const isDesktopSecondaryWindowActionIdentityCurrent = <
  Kind extends string,
  VisualContext,
>(
  action: DesktopSecondaryWindowActionIdentity<Kind>,
  currentState:
    | DesktopSecondaryWindowStateRecord<Kind, VisualContext>
    | null
    | undefined,
): boolean => {
  if (!currentState || !hasValidStateIdentity(currentState)) {
    return false;
  }
  return (
    action.kind === currentState.kind &&
    typeof action.instanceId === "string" &&
    action.instanceId.trim() === currentState.instanceId &&
    typeof action.requestId === "string" &&
    action.requestId.trim().length > 0 &&
    isPositiveInteger(action.stateRevision) &&
    action.stateRevision === currentState.revision
  );
};

export const shouldAcceptDesktopSecondaryWindowState = <
  Kind extends string,
  VisualContext,
>(
  currentState:
    | DesktopSecondaryWindowStateRecord<Kind, VisualContext>
    | null
    | undefined,
  nextState: DesktopSecondaryWindowStateRecord<Kind, VisualContext>,
): boolean =>
  hasValidStateIdentity(nextState) &&
  (!currentState ||
    (nextState.kind === currentState.kind &&
      nextState.revision > currentState.revision));

export const createDesktopSecondaryWindowStateEmitter = <
  Kind extends string,
  VisualContext,
>({
  isCurrent,
  emit,
}: {
  isCurrent: (
    state: DesktopSecondaryWindowStateRecord<Kind, VisualContext>,
  ) => boolean;
  emit: (
    state: DesktopSecondaryWindowStateRecord<Kind, VisualContext>,
  ) => Promise<void>;
}) => {
  const tailByKind = new Map<Kind, Promise<void>>();
  return (
    state: DesktopSecondaryWindowStateRecord<Kind, VisualContext>,
  ): Promise<void> => {
    const previous = tailByKind.get(state.kind) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(async () => {
      if (isCurrent(state)) {
        await emit(state);
      }
    });
    tailByKind.set(state.kind, task);
    void task
      .finally(() => {
        if (tailByKind.get(state.kind) === task) {
          tailByKind.delete(state.kind);
        }
      })
      .catch(() => undefined);
    return task;
  };
};

export const createDesktopSecondaryWindowStateStore = <
  Kind extends string,
  VisualContext = unknown,
>(options: { createInstanceId?: () => string } = {}) => {
  const stateByKind = new Map<
    Kind,
    DesktopSecondaryWindowStateRecord<Kind, VisualContext>
  >();
  const intentByKind = new Map<Kind, DesktopSecondaryWindowIntent<Kind>>();
  const revisionByKind = new Map<Kind, number>();
  const generationByKind = new Map<Kind, number>();
  const createInstanceId = options.createInstanceId ?? createDefaultInstanceId;
  let visualContext: VisualContext | null = null;
  let visualContextSignature = serializeVisualContext(visualContext);

  const beginIntent = (
    kind: Kind,
    rotateInstance: boolean,
  ): DesktopSecondaryWindowIntent<Kind> => {
    const previous = intentByKind.get(kind);
    const intent = {
      kind,
      instanceId:
        !rotateInstance && previous?.instanceId
          ? previous.instanceId
          : createInstanceId(),
      generation: (generationByKind.get(kind) ?? 0) + 1,
    };
    generationByKind.set(kind, intent.generation);
    intentByKind.set(kind, intent);
    return intent;
  };

  const isCurrentIntent = (intent: DesktopSecondaryWindowIntent<Kind>) => {
    const current = intentByKind.get(intent.kind);
    return (
      current?.instanceId === intent.instanceId &&
      current.generation === intent.generation
    );
  };

  const publishForIntent = (
    intent: DesktopSecondaryWindowIntent<Kind>,
    {
      title,
      payload,
    }: {
      title: string;
      payload?: unknown;
    },
  ): DesktopSecondaryWindowStateRecord<Kind, VisualContext> | null => {
    if (!isCurrentIntent(intent)) {
      return null;
    }
    const state: DesktopSecondaryWindowStateRecord<Kind, VisualContext> = {
      kind: intent.kind,
      title,
      payload: payload ?? null,
      instanceId: intent.instanceId,
      intentGeneration: intent.generation,
      revision: (revisionByKind.get(intent.kind) ?? 0) + 1,
      visualContext,
    };
    stateByKind.set(intent.kind, state);
    revisionByKind.set(intent.kind, state.revision);
    return state;
  };

  const publish = ({
    kind,
    title,
    payload,
  }: {
    kind: Kind;
    title: string;
    payload?: unknown;
  }): DesktopSecondaryWindowStateRecord<Kind, VisualContext> => {
    const state = publishForIntent(beginIntent(kind, false), { title, payload });
    if (!state) {
      throw new Error("DESKTOP_SECONDARY_WINDOW_INTENT_REPLACED");
    }
    return state;
  };

  const setVisualContext = (
    nextVisualContext: VisualContext | null,
  ): Array<DesktopSecondaryWindowStateRecord<Kind, VisualContext>> => {
    const nextSignature = serializeVisualContext(nextVisualContext);
    if (nextSignature === visualContextSignature) {
      return [];
    }
    visualContext = nextVisualContext;
    visualContextSignature = nextSignature;
    const updatedStates: Array<
      DesktopSecondaryWindowStateRecord<Kind, VisualContext>
    > = [];
    stateByKind.forEach((state, kind) => {
      const nextState = {
        ...state,
        revision: state.revision + 1,
        visualContext,
      };
      stateByKind.set(kind, nextState);
      revisionByKind.set(kind, nextState.revision);
      updatedStates.push(nextState);
    });
    return updatedStates;
  };

  const planOpen = ({
    kind,
    title,
    payload,
    hasExistingWindow,
  }: {
    kind: Kind;
    title: string;
    payload?: unknown;
    hasExistingWindow: boolean;
  }): DesktopSecondaryWindowOpenPlan<Kind, VisualContext> => {
    const intent = beginIntent(kind, true);
    const state = publishForIntent(intent, { title, payload });
    if (!state) {
      throw new Error("DESKTOP_SECONDARY_WINDOW_INTENT_REPLACED");
    }
    return {
      state,
      shouldCreateWindow: !hasExistingWindow,
      shouldFocusWindow: true,
      shouldShowSkeletonImmediately: true,
      shouldSyncStateImmediately: hasExistingWindow,
    };
  };

  return {
    beginOpen: (kind: Kind) => beginIntent(kind, true),
    publish,
    publishForIntent,
    planOpen,
    setVisualContext,
    getVisualContext: () => visualContext,
    get: (kind: Kind) => stateByKind.get(kind) ?? null,
    getCurrentIntent: (kind: Kind) => intentByKind.get(kind) ?? null,
    isCurrentIntent,
    isCurrentState: (
      state: DesktopSecondaryWindowStateRecord<Kind, VisualContext>,
    ) => {
      const current = stateByKind.get(state.kind);
      return (
        current?.instanceId === state.instanceId &&
        current.revision === state.revision
      );
    },
    forget: (kind: Kind, expectedInstanceId?: string) => {
      const current = stateByKind.get(kind);
      if (!current || (expectedInstanceId && current.instanceId !== expectedInstanceId)) {
        return false;
      }
      stateByKind.delete(kind);
      intentByKind.delete(kind);
      return true;
    },
  };
};
