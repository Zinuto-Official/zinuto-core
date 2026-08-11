// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties, ReactNode } from "react"
import { Button } from "@/ui/primitives/button"
import { cn } from "@/ui/cn"

type FilterChipProps = {
  active?: boolean
  onClick?: () => void
  className?: string
  style?: CSSProperties
  leadingDot?: boolean
  label: ReactNode
  count?: ReactNode
}

export const FilterChip = ({
  active = false,
  onClick,
  className,
  style,
  leadingDot = false,
  label,
  count,
}: FilterChipProps) => (
  <Button
    type="button"
    variant="ghost"
    size="sm"
    className={cn("ui-filter-chip", active && "is-active", className)}
    style={style}
    onClick={onClick}
  >
    {leadingDot ? <span className="ui-filter-chip-dot" aria-hidden="true" /> : null}
    <span className="ui-filter-chip-label">{label}</span>
    {count !== undefined ? (
      <span className="ui-filter-chip-count">{count}</span>
    ) : null}
  </Button>
)
