// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/ui/cn"
import { uiPillClassName } from "@/ui/primitives/ui-system"

const badgeVariants = cva(
  `group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border border-transparent px-2 py-0.5 text-r1 font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3! ${uiPillClassName}`,
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--ui-badge-accent-border)] bg-[color:var(--ui-badge-accent-bg)] text-[color:var(--ui-badge-accent-text)] [a]:hover:bg-[color:var(--ui-text-action-active-bg)]",
        secondary:
          "border-[color:var(--ui-action-quiet-border)] bg-[color:var(--ui-action-quiet-bg)] text-[color:var(--text)] [a]:hover:bg-[color:var(--ui-action-quiet-hover)]",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline:
          "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost:
          "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge }
