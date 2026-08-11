// SPDX-License-Identifier: GPL-3.0-only

import { formatMessageByLanguage } from "@/frontend-kernel/i18n/messageRuntime";
import type {
  DesktopSecondaryWindowKind,
  DesktopSecondaryWindowStatePayload,
} from "@/frontend-kernel/secondary-windows/desktopSecondaryWindowContracts";
import { Button } from "@/ui/primitives/button";

export type SecondaryWindowLoadingSkeletonStatus = "loading" | "error";

const STARTUP_PRODUCT_NAME = "Zinuto";

const readSkeletonLanguage = (
  state: DesktopSecondaryWindowStatePayload | null,
) => state?.visualContext?.language ?? "en";

/**
 * Normal secondary-window startup stays native-hidden until content is ready,
 * so the loading state intentionally has no visual surface. This component is
 * visible only when dependency guards have settled in the error state.
 */
export const SecondaryWindowLoadingSkeleton = ({
  kind,
  onClose,
  onRetry,
  state,
  status,
}: {
  kind: DesktopSecondaryWindowKind;
  onClose?: () => void;
  onRetry?: () => void;
  state: DesktopSecondaryWindowStatePayload | null;
  status: SecondaryWindowLoadingSkeletonStatus;
}) => {
  if (status === "loading") {
    return null;
  }

  const language = readSkeletonLanguage(state);
  const statusLabel = formatMessageByLanguage(
    language,
    "common.status.loadFailed",
  );

  return (
    <section
      className={`secondary-window-loading-skeleton is-${status}`}
      data-secondary-window-kind={kind}
      data-secondary-window-loading-status={status}
      role="status"
      aria-live="polite"
      aria-label={statusLabel}
    >
      <div className="secondary-window-loading-unified">
        <strong className="secondary-window-loading-unified__brand">
          {STARTUP_PRODUCT_NAME}
        </strong>
        <span className="secondary-window-loading-unified__message">
          {statusLabel}
        </span>
      </div>
      <div className="secondary-window-loading-recovery-actions">
        {onClose ? (
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {formatMessageByLanguage(language, "appText.close2")}
          </Button>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="default" size="sm" onClick={onRetry}>
            {formatMessageByLanguage(language, "appText.retry")}
          </Button>
        ) : null}
      </div>
    </section>
  );
};
