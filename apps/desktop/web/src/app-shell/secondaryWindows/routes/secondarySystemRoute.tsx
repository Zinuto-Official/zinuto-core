// SPDX-License-Identifier: GPL-3.0-only

import "@/styles/popup-system.css";

import { useState } from "react";
import { formatMessage } from "@zinuto/shared/i18n";
import { Button } from "@/ui/primitives/button";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import {
  closeCurrentDesktopSecondaryWindow,
  sendDesktopSecondaryWindowRouteAction,
} from "@/app-shell/secondaryWindows/desktopSecondaryWindowBridge";
import { isSystemGlobalResetConfirmWindowPayload } from "@/app-shell/systemGlobalResetConfirmWindow";
import {
  SecondaryWindowRoutePlaceholder,
  type SecondaryWindowRouteProps,
} from "@/app-shell/secondaryWindows/routes/secondaryWindowRouteTypes";

const SystemGlobalResetConfirmSecondaryWindow = ({
  state,
  language,
}: SecondaryWindowRouteProps) => {
  const payload = state.payload;
  if (!isSystemGlobalResetConfirmWindowPayload(payload)) {
    return <SecondaryWindowRoutePlaceholder state={state} />;
  }

  const [isSubmitting, setIsSubmitting] = useState(false);
  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    void closeCurrentDesktopSecondaryWindow();
  };
  const handleConfirm = () => {
    if (isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    void sendDesktopSecondaryWindowRouteAction(
      state,
      "CONFIRM_GLOBAL_RESET",
    )
      .then(() => {
        void closeCurrentDesktopSecondaryWindow();
      })
      .catch(() => {
        setIsSubmitting(false);
      });
  };
  const affectedPoolCount = Math.max(
    0,
    Math.floor(Number(payload.affectedPoolCount) || 0),
  );
  const affectedSymbolCount = Math.max(
    0,
    Math.floor(Number(payload.affectedSymbolCount) || 0),
  );

  return (
    <section className="desktop-secondary-window-panel desktop-secondary-window-system-reset-confirm">
      <header className="system-reset-confirm-header">
        <span className="system-reset-confirm-badge">
          {formatMessage(language, "appText.oneClickReset2")}
        </span>
        <h1 className="system-reset-confirm-title">
          {formatMessage(language, "appText.confirmOneClickReset")}
        </h1>
        <p className="system-reset-confirm-description">
          {formatMessage(language, "appText.actionUndoneProceedCarefully")}
        </p>
        <div className="system-reset-confirm-metrics">
          <div className="system-reset-confirm-metric">
            <span>{formatMessage(language, "appText.totalUsage")}</span>
            <strong>{payload.totalUsageText}</strong>
          </div>
          <div className="system-reset-confirm-metric">
            <span>{formatMessage(language, "appText.symbol")}</span>
            <strong>{affectedPoolCount}</strong>
          </div>
          <div className="system-reset-confirm-metric">
            <span>{formatMessage(language, "appText.bars")}</span>
            <strong>{affectedSymbolCount}</strong>
          </div>
        </div>
      </header>
      <footer className="system-reset-confirm-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={handleClose}
          disabled={isSubmitting}
        >
          <VendorIcon name="x" />
          <span>{formatMessage(language, "appText.cancel")}</span>
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={isSubmitting}
          loadingLabel={formatMessage(language, "appText.confirmOneClickReset")}
          onClick={handleConfirm}
        >
          <VendorIcon name="trash2" />
          <span>{formatMessage(language, "appText.confirmOneClickReset")}</span>
        </Button>
      </footer>
    </section>
  );
};

const SecondarySystemRoute = (props: SecondaryWindowRouteProps) => {
  if (props.kind === "SYSTEM_GLOBAL_RESET_CONFIRM") {
    return <SystemGlobalResetConfirmSecondaryWindow {...props} />;
  }

  return <SecondaryWindowRoutePlaceholder state={props.state} />;
};

export default SecondarySystemRoute;
