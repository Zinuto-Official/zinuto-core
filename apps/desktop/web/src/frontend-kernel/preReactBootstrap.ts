// SPDX-License-Identifier: GPL-3.0-only

const PRE_REACT_BOOTSTRAP_WATCHDOG_MS = 8_000;
const PREBOOT_MESSAGE_SELECTOR = "[data-zinuto-preboot-message]";
const PREBOOT_FAILURE_BODY_SELECTOR = "[data-zinuto-preboot-failure-body]";
const PREBOOT_FAILURE_TITLE_SELECTOR = "[data-zinuto-preboot-failure-title]";
const PREBOOT_RETRY_SELECTOR = "[data-zinuto-preboot-retry]";
const PREBOOT_STATUS_SELECTOR = "[data-zinuto-preboot-status]";
const PREBOOT_SURFACE_SELECTOR = "[data-zinuto-startup-surface]";

type PreReactBootstrapOptions = {
  loadApplication: () => Promise<unknown>;
  loadFallbackLocale?: () => Promise<void>;
  loadPrimaryLocale: () => Promise<void>;
};

const updatePreReactBootstrapStatus = (
  state: "failed" | "loading" | "ready",
): void => {
  if (typeof document === "undefined") {
    return;
  }
  const status = document.querySelector<HTMLElement>(PREBOOT_STATUS_SELECTOR);
  if (!status) {
    return;
  }
  status.setAttribute("aria-busy", state === "loading" ? "true" : "false");
  if (state === "failed" && status.dataset.zinutoFailureLabel) {
    status.setAttribute("aria-label", status.dataset.zinutoFailureLabel);
    status.setAttribute("aria-live", "assertive");
    status.setAttribute("role", "alert");
  }
};

const revealPreReactBootstrapFailure = (error: unknown): void => {
  console.error("[zinuto-pre-react-bootstrap]", error);
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.zinutoBootstrapState = "failed";
  updatePreReactBootstrapStatus("failed");
  const surface = document.querySelector<HTMLElement>(
    PREBOOT_SURFACE_SELECTOR,
  );
  const status = document.querySelector<HTMLElement>(PREBOOT_STATUS_SELECTOR);
  const message = document.querySelector<HTMLElement>(PREBOOT_MESSAGE_SELECTOR);
  const failureBody = document.querySelector<HTMLElement>(
    PREBOOT_FAILURE_BODY_SELECTOR,
  );
  const failureTitle = document.querySelector<HTMLElement>(
    PREBOOT_FAILURE_TITLE_SELECTOR,
  );
  if (surface) {
    surface.dataset.zinutoStartupCopyVisible = "true";
    surface.dataset.zinutoStartupState = "failed";
  }
  if (message) {
    message.hidden = true;
  }
  if (failureTitle) {
    if (status?.dataset.zinutoFailureLabel) {
      failureTitle.textContent = status.dataset.zinutoFailureLabel;
    }
    failureTitle.hidden = false;
  }
  if (failureBody) {
    failureBody.hidden = false;
  }
  const retryButton = document.querySelector<HTMLButtonElement>(
    PREBOOT_RETRY_SELECTOR,
  );
  if (!retryButton) {
    return;
  }
  retryButton.hidden = false;
  if (retryButton.dataset.zinutoRetryBound === "true") {
    return;
  }
  retryButton.dataset.zinutoRetryBound = "true";
  retryButton.addEventListener("click", () => window.location.reload());
};

const loadLocaleWithFallback = async ({
  loadFallbackLocale,
  loadPrimaryLocale,
}: Pick<
  PreReactBootstrapOptions,
  "loadFallbackLocale" | "loadPrimaryLocale"
>): Promise<void> => {
  try {
    await loadPrimaryLocale();
  } catch (primaryError) {
    if (!loadFallbackLocale) {
      throw primaryError;
    }
    console.warn(
      "[zinuto-pre-react-bootstrap] primary locale unavailable; using base locale",
      primaryError,
    );
    await loadFallbackLocale();
  }
};

export const runPreReactBootstrap = async (
  options: PreReactBootstrapOptions,
): Promise<boolean> => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.zinutoBootstrapState = "loading";
    updatePreReactBootstrapStatus("loading");
  }
  const watchdogId =
    typeof window === "undefined"
      ? null
      : window.setTimeout(() => {
          revealPreReactBootstrapFailure(
            new Error("Pre-React bootstrap exceeded its readiness deadline"),
          );
        }, PRE_REACT_BOOTSTRAP_WATCHDOG_MS);
  try {
    // Locale data and the first application chunk are independent network
    // resources. Fetch them together so a large locale catalog cannot serialize
    // the entire startup path behind the static preboot surface.
    await Promise.all([
      loadLocaleWithFallback(options),
      options.loadApplication(),
    ]);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.zinutoBootstrapState = "ready";
      updatePreReactBootstrapStatus("ready");
    }
    return true;
  } catch (error) {
    revealPreReactBootstrapFailure(error);
    return false;
  } finally {
    if (watchdogId !== null) {
      window.clearTimeout(watchdogId);
    }
  }
};
