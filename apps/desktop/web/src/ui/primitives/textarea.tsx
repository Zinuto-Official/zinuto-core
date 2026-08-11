// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react"

import { cn } from "@/ui/cn"
import { uiFieldShellVariants } from "@/ui/primitives/ui-system"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea"> & {
    density?: "compact" | "default" | "large"
  }
>(({ className, density = "default", ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        uiFieldShellVariants({ density, multiline: true }),
        "resize-y",
        className,
      )}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
