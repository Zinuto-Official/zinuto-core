// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react"
import { Card } from "@/ui/primitives/card"
import { cn } from "@/ui/cn"
import {
  uiSoftSurfaceCardClassName,
  uiSurfaceCardClassName,
} from "@/ui/primitives/ui-system"

const SURFACE_CARD_CLASS =
  `surface-card py-0 shadow-none ring-0 gap-0 ${uiSurfaceCardClassName}`
const SOFT_SURFACE_CARD_CLASS =
  `surface-card soft-surface-card py-0 shadow-none ring-0 gap-0 ${uiSoftSurfaceCardClassName}`

export function SurfaceCard({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  return (
    <Card
      data-surface-card="default"
      className={cn(SURFACE_CARD_CLASS, className)}
      {...props}
    />
  )
}

export function SoftSurfaceCard({
  className,
  ...props
}: React.ComponentProps<typeof Card>) {
  return (
    <Card
      data-surface-card="soft"
      className={cn(SOFT_SURFACE_CARD_CLASS, className)}
      {...props}
    />
  )
}
