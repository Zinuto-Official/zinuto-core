// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react"
import { Button, type ButtonProps } from "@/ui/primitives/button"
import { cn } from "@/ui/cn"
import {
  TradingActionButton,
  type TradingActionTone,
} from "@/ui/components/TradingActionButton"

type SpecialTrainingActionPriority =
  | "primary"
  | "secondary"
  | "muted"
  | "low-priority"

type SpecialTrainingActionButtonProps = Omit<
  ButtonProps,
  "children" | "className"
> & {
  label: ReactNode
  hotkey?: ReactNode
  icon?: ReactNode
  iconPlaceholder?: boolean
  subtitle?: ReactNode
  priority?: SpecialTrainingActionPriority
  tone?: TradingActionTone
  single?: boolean
}

const priorityClassNameByPriority: Record<SpecialTrainingActionPriority, string> = {
  primary: "ui-special-training-action-button--primary",
  secondary: "ui-special-training-action-button--secondary",
  muted: "ui-special-training-action-button--muted",
  "low-priority": "ui-special-training-action-button--low-priority",
}

const renderContent = ({
  label,
  hotkey,
  icon,
  iconPlaceholder,
  subtitle,
  single,
}: Pick<
  SpecialTrainingActionButtonProps,
  "label" | "hotkey" | "icon" | "iconPlaceholder" | "subtitle" | "single"
>) => (
  <span
    className={cn(
      "ui-special-training-action-button-content",
      single && "is-single",
    )}
  >
    <span
      className={cn(
        "ui-special-training-action-button-main",
        !icon && !iconPlaceholder && "is-no-icon",
      )}
    >
      {icon || iconPlaceholder ? (
        <span
          className={cn(
            "ui-special-training-action-button-icon-slot",
            iconPlaceholder && "is-placeholder",
          )}
          aria-hidden={iconPlaceholder ? "true" : undefined}
        >
          {icon}
        </span>
      ) : null}
      <span className="ui-special-training-action-button-copy">
        <span className="ui-special-training-action-button-label">{label}</span>
        {subtitle ? (
          <span className="ui-special-training-action-button-subtitle">
            {subtitle}
          </span>
        ) : null}
      </span>
    </span>
    {hotkey ? (
      <span className="ui-special-training-action-button-key">{hotkey}</span>
    ) : null}
  </span>
)

export const SpecialTrainingActionButton = ({
  label,
  hotkey,
  icon,
  iconPlaceholder = false,
  subtitle,
  priority = "secondary",
  tone,
  single = false,
  variant = "secondary",
  size = "default",
  ...props
}: SpecialTrainingActionButtonProps) => {
  const className = cn(
    "ui-special-training-action-button",
    priorityClassNameByPriority[priority],
  )
  const content = renderContent({
    label,
    hotkey,
    icon,
    iconPlaceholder,
    subtitle,
    single,
  })

  if (tone) {
    return (
      <TradingActionButton
        tone={tone}
        size={size}
        className={className}
        {...props}
      >
        {content}
      </TradingActionButton>
    )
  }

  return (
    <Button variant={variant} size={size} className={className} {...props}>
      {content}
    </Button>
  )
}
