// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react"

import { cn } from "@/ui/cn"
import { uiFieldShellVariants } from "@/ui/primitives/ui-system"

const Input = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<"input"> & {
    density?: "compact" | "default" | "large"
  }
>(({ className, type, density = "default", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          uiFieldShellVariants({ density }),
          "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-r2 file:font-medium file:text-[color:var(--ui-text-action-fg)]",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
