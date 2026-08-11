// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties, ReactNode } from "react"
import { Button } from "@/ui/primitives/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip"
import { VendorIcon } from "@/assets/graphics"
import { cn } from "@/ui/cn"

type TagChipProps = {
  label: ReactNode
  style?: CSSProperties
  className?: string
  readonly?: boolean
  onRemove?: () => void
  onAction?: () => void
  actionLabel?: string
}

export const TagChip = ({
  label,
  style,
  className,
  readonly = false,
  onRemove,
  onAction,
  actionLabel,
}: TagChipProps) => {
  const actionButton = onRemove ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="ui-tag-chip-action"
      onClick={onRemove}
      aria-label={actionLabel}
    >
      <VendorIcon name="x" aria-hidden="true" />
    </Button>
  ) : onAction ? (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className="ui-tag-chip-action"
      onClick={onAction}
      aria-label={actionLabel}
    >
      <VendorIcon name="plus" aria-hidden="true" />
    </Button>
  ) : null

  return (
    <span
      className={cn("ui-tag-chip", readonly && "is-readonly", className)}
      style={style}
    >
      <span className="ui-tag-chip-dot" aria-hidden="true" />
      <span className="ui-tag-chip-label">{label}</span>
      {actionButton && actionLabel ? (
        <Tooltip delay={0}>
          <TooltipTrigger asChild>{actionButton}</TooltipTrigger>
          <TooltipContent sideOffset={6}>{actionLabel}</TooltipContent>
        </Tooltip>
      ) : (
        actionButton
      )}
    </span>
  )
}
