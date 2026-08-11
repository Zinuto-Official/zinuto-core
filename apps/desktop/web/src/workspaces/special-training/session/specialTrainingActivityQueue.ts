// SPDX-License-Identifier: GPL-3.0-only

export type SpecialTrainingActivityResultLike = {
  paused: boolean;
};

type ActivityRequest<Result extends SpecialTrainingActivityResultLike> = (
  challengeId: string,
  paused: boolean,
) => Promise<Result>;

type ScheduledActivityRequest<Result extends SpecialTrainingActivityResultLike> = {
  scheduled: boolean;
  completion: Promise<Result | null>;
};

export type SpecialTrainingActivityQueue<
  Result extends SpecialTrainingActivityResultLike,
> = {
  clearDesiredActivity: () => void;
  scheduleActivity: (
    challengeId: string,
    paused: boolean,
  ) => ScheduledActivityRequest<Result>;
};

export const createSpecialTrainingActivityQueue = <
  Result extends SpecialTrainingActivityResultLike,
>(
  requestActivity: ActivityRequest<Result>,
): SpecialTrainingActivityQueue<Result> => {
  let desiredActivityKey = "";
  let desiredRevision = 0;
  let queueTail: Promise<void> = Promise.resolve();
  let latestCompletion: Promise<Result | null> = Promise.resolve(null);

  const clearDesiredActivity = () => {
    if (!desiredActivityKey) {
      return;
    }
    desiredActivityKey = "";
    desiredRevision += 1;
    latestCompletion = Promise.resolve(null);
  };

  const scheduleActivity = (
    challengeId: string,
    paused: boolean,
  ): ScheduledActivityRequest<Result> => {
    const normalizedChallengeId = String(challengeId || "").trim();
    if (!normalizedChallengeId) {
      clearDesiredActivity();
      return { scheduled: false, completion: latestCompletion };
    }

    const activityKey = `${normalizedChallengeId}:${paused ? "paused" : "active"}`;
    if (activityKey === desiredActivityKey) {
      return { scheduled: false, completion: latestCompletion };
    }

    desiredActivityKey = activityKey;
    desiredRevision += 1;
    const scheduledRevision = desiredRevision;
    const request = queueTail.then(() =>
      requestActivity(normalizedChallengeId, paused),
    );
    queueTail = request.then(
      () => undefined,
      () => undefined,
    );
    latestCompletion = request.then(
      (result) => {
        if (
          desiredRevision !== scheduledRevision ||
          desiredActivityKey !== activityKey
        ) {
          return null;
        }
        if (result.paused !== paused) {
          desiredActivityKey = "";
          throw new Error("SPECIAL_TRAINING_ACTIVITY_STATE_MISMATCH");
        }
        return result;
      },
      (error: unknown) => {
        if (
          desiredRevision !== scheduledRevision ||
          desiredActivityKey !== activityKey
        ) {
          return null;
        }
        desiredActivityKey = "";
        throw error;
      },
    );

    return { scheduled: true, completion: latestCompletion };
  };

  return {
    clearDesiredActivity,
    scheduleActivity,
  };
};
