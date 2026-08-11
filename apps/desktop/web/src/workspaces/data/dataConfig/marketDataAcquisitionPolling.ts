// SPDX-License-Identifier: GPL-3.0-only

export const MARKET_DATA_ACQUISITION_POLL_RETRY_MAX = 3;

const POLL_DELAY_MS = 700;
const POLL_RETRY_BASE_DELAY_MS = 700;
const POLL_RETRY_MAX_DELAY_MS = 5_600;

const formatDateInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const createDefaultMarketDataAcquisitionDateRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  return { startDate: formatDateInput(start), endDate: formatDateInput(end) };
};

const waitForDelay = (delayMs: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const complete = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = window.setTimeout(complete, delayMs);
    const cancel = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", cancel, { once: true });
  });

export const waitForMarketDataAcquisitionPoll = (
  signal: AbortSignal,
): Promise<void> => waitForDelay(POLL_DELAY_MS, signal);

export const waitForMarketDataAcquisitionPollRetry = (
  attemptIndex: number,
  signal: AbortSignal,
): Promise<void> =>
  waitForDelay(
    Math.min(
      POLL_RETRY_MAX_DELAY_MS,
      POLL_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attemptIndex - 1),
    ),
    signal,
  );
