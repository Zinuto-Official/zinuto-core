// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import type { NoticeDialogState } from "@/frontend-kernel/notifications/globalNoticeDialog";
import type { AppTextKey } from "@/frontend-kernel/i18n/messageRuntime";
import { useI18n } from "@/frontend-kernel/i18n";
import { cn } from "@/ui/cn";
import { type KeyboardEvent, type ReactNode } from "react";
import { AppModal } from "@/ui/components/AppModal";
import { StandardModalFrame } from "@/ui/components";

export type { NoticeDialogState } from "@/frontend-kernel/notifications/globalNoticeDialog";

export type OrderEndPromptState = {
  side: "BUY" | "SELL";
} | null;

export type AppUtilityDialogsProps = {
  actionDialogOpen: boolean;
  noticeDialog: NoticeDialogState;
  noticeCountdownSec: number;
  onCloseNoticeDialog: () => void;
  orderEndPrompt: OrderEndPromptState;
  onCloseOrderEndPrompt: () => void;
  onConfirmOrderEndPrompt: () => void;
  compactScriptLanguage: boolean;
  tt: (key: AppTextKey) => string;
  ttf: (key: AppTextKey, args?: Array<unknown>) => string;
};

type UtilityDialogFrameProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description: ReactNode;
  actions: ReactNode;
  body?: ReactNode;
  className?: string;
  footerClassName?: string;
  footerMode?: "end" | "between";
  tone?: "default" | "danger" | "notice";
  overlayClassName?: string;
  manualCloseOnly?: boolean;
};

const UtilityDialogFrame = ({
  open,
  onClose,
  title,
  description,
  actions,
  body,
  className,
  footerClassName,
  footerMode = "end",
  tone = "default",
  overlayClassName,
  manualCloseOnly = false,
}: UtilityDialogFrameProps) => (
  <AppModal
    open={open}
    onClose={onClose}
    preset="alert"
    overlayClassName={overlayClassName}
    closeOnInteractOutside={!manualCloseOnly}
    closeOnEscapeKeyDown
    accessibilityTitle={title}
    accessibilityDescription={description}
    className={cn(
      "utility-modal",
      tone === "danger" ? "utility-modal-danger" : "",
      tone === "notice" ? "utility-modal-notice" : "",
      className,
    )}
  >
    <div
      onKeyDownCapture={(event: KeyboardEvent<HTMLDivElement>) => {
        if (!manualCloseOnly) {
          return;
        }
        if (event.key === " " || event.code === "Space") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="utility-modal-hero" aria-hidden="true">
        <span className="utility-modal-hero-ring utility-modal-hero-ring-primary" />
        <span className="utility-modal-hero-ring utility-modal-hero-ring-secondary" />
        <span className="utility-modal-hero-core" />
      </div>
      <StandardModalFrame
        variant="alert"
        className="utility-modal-frame"
        headerClassName="utility-modal-header"
        title={
          <div
            data-i18n-slot="cardTitle"
            data-i18n-critical="true"
          >
            {title}
          </div>
        }
        description={
          <div
            data-i18n-slot="bodyCopy"
            data-i18n-critical="true"
          >
            {description}
          </div>
        }
        footerMode={footerMode}
        bodyClassName="utility-modal-body"
        footerClassName={footerClassName}
        actions={
          <div
            className="ui-standard-modal-action-group"
            data-i18n-slot="dialogFooter"
          >
            {actions}
          </div>
        }
      >
        {body}
      </StandardModalFrame>
    </div>
  </AppModal>
);

export const AppUtilityDialogs = ({
  actionDialogOpen,
  noticeDialog,
  noticeCountdownSec,
  onCloseNoticeDialog,
  orderEndPrompt,
  onCloseOrderEndPrompt,
  onConfirmOrderEndPrompt,
  compactScriptLanguage,
  tt,
  ttf,
}: AppUtilityDialogsProps) => {
  const { t } = useI18n();

  return (
    <>
      {!actionDialogOpen && noticeDialog ? (
        <UtilityDialogFrame
          open={!actionDialogOpen && Boolean(noticeDialog)}
          onClose={onCloseNoticeDialog}
          title={noticeDialog.title}
          description={noticeDialog.message}
          tone={noticeDialog.severity === "error" ? "danger" : "notice"}
          manualCloseOnly
          overlayClassName={
            noticeDialog.severity === "error" ? "z-[1500]" : undefined
          }
          className={
            noticeDialog.severity === "error" ? "z-[1510]" : undefined
          }
          actions={
            <Button variant="secondary" onClick={onCloseNoticeDialog}>
              {noticeDialog.autoCloseMs
                ? t("dialogs.action.confirmCountdown", {
                    seconds: noticeCountdownSec,
                  })
                : tt("appText.confirm")}
            </Button>
          }
        />
      ) : null}

      {!actionDialogOpen && orderEndPrompt ? (
        <UtilityDialogFrame
          open={!actionDialogOpen && Boolean(orderEndPrompt)}
          onClose={onCloseOrderEndPrompt}
          title={tt("appText.nextKline")}
          description={
            <>
              {tt("appText.lastKlineTransactionPriceModeNextOpeningPrice")}
              {compactScriptLanguage
                ? `${orderEndPrompt.side === "BUY" ? tt("appText.buy3") : tt("appText.sell3")}${tt("appText.endTraining2")}`
                : ttf("appText.value0EndTraining", [
                    orderEndPrompt.side === "BUY"
                      ? tt("appText.buy3")
                      : tt("appText.sell3"),
                  ])}
            </>
          }
          actions={
            <>
              <Button variant="ghost" onClick={onCloseOrderEndPrompt}>
                {tt("appText.cancel")}
              </Button>
              <Button variant="default" onClick={onConfirmOrderEndPrompt}>
                {tt("appText.endTraining")}
              </Button>
            </>
          }
        />
      ) : null}
    </>
  );
};
