// SPDX-License-Identifier: GPL-3.0-only

export type FastDecisionSubmitGateInput = {
  hasQuestionBars: boolean;
  hasResult: boolean;
  phase: string;
  hasPendingResult: boolean;
  submitInFlight: boolean;
};

// Single gate for the fast-decision POST. The in-flight flag is owned by the
// calling hook (fastDecisionSubmitInFlightRef) and is set before the request is
// sent, then always reset in finally. Keeping the predicate pure lets the
// polling-tick semantics be tested without a React renderer: a slow response
// must block duplicate submissions, while a rejected POST (flag reset) must be
// retryable on the next tick.
export const canSubmitFastDecision = ({
  hasQuestionBars,
  hasResult,
  phase,
  hasPendingResult,
  submitInFlight,
}: FastDecisionSubmitGateInput): boolean =>
  Boolean(
    hasQuestionBars &&
      !hasResult &&
      phase === "THINKING" &&
      !hasPendingResult &&
      !submitInFlight,
  );
