// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react"
import { Badge } from "@/ui/primitives/badge"
import { cn } from "@/ui/cn"

type KeycapProps = {
  children: ReactNode
  className?: string
}

export const Keycap = ({ children, className }: KeycapProps) => (
  <Badge
    variant="outline"
    className={cn(
      "inline-flex h-5 min-w-[20px] items-center justify-center rounded-[7px] border border-subtle/80 bg-elevated px-1.5 text-r1 font-semibold text-text-secondary shadow-emboss",
      className
    )}
  >
    <kbd>{children}</kbd>
  </Badge>
)
