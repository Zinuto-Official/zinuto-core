// SPDX-License-Identifier: GPL-3.0-only

import { forwardRef, type InputHTMLAttributes } from "react"
import { Input } from "@/ui/primitives/input"
import { cn } from "@/ui/cn"

type SearchInputProps = InputHTMLAttributes<HTMLInputElement>

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, ...props }, ref) => (
    <Input
      ref={ref}
      type="search"
      className={cn("placeholder:text-[color:var(--text-disabled)]", className)}
      {...props}
    />
  ),
)

SearchInput.displayName = "SearchInput"
