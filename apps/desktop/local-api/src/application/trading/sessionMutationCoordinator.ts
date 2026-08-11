// SPDX-License-Identifier: GPL-3.0-only

type CreateSessionMutationCoordinatorDeps = {
  ensureBackendStartupReady: () => void;
};

export const createSessionMutationCoordinator = ({
  ensureBackendStartupReady,
}: CreateSessionMutationCoordinatorDeps) => {
  const sessionMutationTails = new Map<string, Promise<void>>();
  let trainingMutationTail: Promise<void> = Promise.resolve();

  const runSerializedSessionMutation = async <T>(
    sessionId: string,
    run: () => Promise<T>,
  ): Promise<T> => {
    await trainingMutationTail.catch(() => undefined);
    const previous = sessionMutationTails.get(sessionId) ?? Promise.resolve();
    let releaseTail: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      releaseTail = resolve;
    });
    const nextTail = previous.catch(() => undefined).then(() => barrier);
    sessionMutationTails.set(sessionId, nextTail);
    await previous.catch(() => undefined);
    try {
      ensureBackendStartupReady();
      return await run();
    } finally {
      releaseTail();
      if (sessionMutationTails.get(sessionId) === nextTail) {
        sessionMutationTails.delete(sessionId);
      }
    }
  };

  const runSerializedTrainingMutation = async <T>(
    run: () => Promise<T>,
  ): Promise<T> => {
    const previousTrainingMutation = trainingMutationTail;
    let releaseTail: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      releaseTail = resolve;
    });
    const nextTrainingMutation = previousTrainingMutation
      .catch(() => undefined)
      .then(() => barrier);
    trainingMutationTail = nextTrainingMutation;
    await previousTrainingMutation.catch(() => undefined);
    await Promise.all(
      Array.from(sessionMutationTails.values(), (tail) =>
        tail.catch(() => undefined),
      ),
    );
    try {
      ensureBackendStartupReady();
      return await run();
    } finally {
      releaseTail();
      if (trainingMutationTail === nextTrainingMutation) {
        trainingMutationTail = Promise.resolve();
      }
    }
  };

  return {
    runSerializedSessionMutation,
    runSerializedTrainingMutation,
  };
};
