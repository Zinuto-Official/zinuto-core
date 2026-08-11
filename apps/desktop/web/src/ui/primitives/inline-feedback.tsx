// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { cn } from "@/ui/cn";
import { Button } from "@/ui/primitives/button";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import {
  useResolvedUiFeedbackMessage,
  type UiFeedback,
} from "@/ui/hooks/useTimedUiFeedback";

type InlineFeedbackProps<TScope extends string = string> = {
  className?: string;
  feedback: UiFeedback<TScope> | null;
  onDismiss?: () => void;
  reserveSpace?: boolean;
  slotClassName?: string;
};

const resolveToneIcon = (tone: UiFeedback["tone"]) => {
  switch (tone) {
    case "success":
      return "check";
    case "warning":
      return "alertTriangle";
    case "error":
      return "alertTriangle";
    case "info":
    default:
      return "circleHelp";
  }
};

const resolveAriaRole = (tone: UiFeedback["tone"]): "alert" | "status" =>
  tone === "error" ? "alert" : "status";

export const InlineFeedback = <TScope extends string = string>({
  className,
  feedback,
  onDismiss,
  reserveSpace = false,
  slotClassName,
}: InlineFeedbackProps<TScope>) => {
  const feedbackMessage = useResolvedUiFeedbackMessage(feedback);
  const content: ReactNode = feedback && feedbackMessage ? (
    <div
      className={cn("ui-inline-feedback", className)}
      data-tone={feedback.tone}
      aria-live={feedback.tone === "error" ? "assertive" : "polite"}
      role={resolveAriaRole(feedback.tone)}
    >
      <VendorIcon
        name={resolveToneIcon(feedback.tone)}
        className="ui-inline-feedback-icon"
      />
      <span className="ui-inline-feedback-message">{feedbackMessage}</span>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="ui-inline-feedback-dismiss"
          onClick={onDismiss}
          aria-label={tt("appText.cancel")}
        >
          <VendorIcon name="x" className="ui-inline-feedback-dismiss-icon" />
        </Button>
      ) : null}
    </div>
  ) : null;

  if (!reserveSpace) {
    return content;
  }

  return (
    <div
      className={cn("ui-inline-feedback-slot", slotClassName)}
      data-has-feedback={feedback ? "true" : "false"}
    >
      {content}
    </div>
  );
};
