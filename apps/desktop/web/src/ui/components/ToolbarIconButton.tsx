// SPDX-License-Identifier: GPL-3.0-only

import { forwardRef } from "react"
import { Button, type ButtonProps } from "@/ui/primitives/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip"
import { cn } from "@/ui/cn"

type ToolbarIconButtonProps = Omit<
  ButtonProps,
  "dataSlot" | "variant" | "size"
> & {
  active?: boolean
  label?: string
}

export const ToolbarIconButton = forwardRef<
  HTMLButtonElement,
  ToolbarIconButtonProps
>(
  (
    {
      active = false,
      children,
      className,
      label,
      title,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const tooltipLabel = title ?? label
    const { "aria-label": ariaLabel, ...buttonProps } = props
    const button = (
      <Button
        {...buttonProps}
        ref={ref}
        type={type}
        dataSlot="toolbar-icon-button"
        variant="inline"
        size="icon-sm"
        data-active={active ? "true" : undefined}
        aria-label={ariaLabel ?? label}
        className={cn("ui-toolbar-icon-button", active && "is-active", className)}
      >
        {children}
      </Button>
    )

    if (!tooltipLabel) {
      return button
    }

    return (
      <Tooltip delay={0}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent sideOffset={6}>{tooltipLabel}</TooltipContent>
      </Tooltip>
    )
  },
)

ToolbarIconButton.displayName = "ToolbarIconButton"
