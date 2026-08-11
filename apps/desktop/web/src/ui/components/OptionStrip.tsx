// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react"
import { Button } from "@/ui/primitives/button"
import { cn } from "@/ui/cn"

type OptionStripOption<T extends string | number> = {
  value: T
  label: ReactNode
  disabled?: boolean
}

type OptionStripLockedOption = {
  key: string
  label: ReactNode
  locked: true
}

type OptionStripProps<T extends string | number> = {
  value: T
  options: readonly (OptionStripOption<T> | OptionStripLockedOption)[]
  onChange?: (value: T) => void
  className?: string
  buttonClassName?: string
}

const isLockedOption = <T extends string | number>(
  option: OptionStripOption<T> | OptionStripLockedOption,
): option is OptionStripLockedOption => "locked" in option

export const shouldHandleOptionStripChange = <T extends string | number>(
  optionValue: T,
  currentValue: T,
  disabled = false,
): boolean => !disabled && optionValue !== currentValue

export const OptionStrip = <T extends string | number>({
  value,
  options,
  onChange,
  className,
  buttonClassName,
}: OptionStripProps<T>) => (
  <div className={cn("ui-option-strip", className)} data-slot="option-strip">
    {options.map((option) => {
      if (isLockedOption(option)) {
        return (
          <span
            key={option.key}
            className="ui-option-strip-item is-active is-locked"
          >
            {option.label}
          </span>
        )
      }

      const active = option.value === value
      return (
        <Button
          key={String(option.value)}
          type="button"
          variant="ghost"
          size="sm"
          disabled={option.disabled}
          className={cn(
            "ui-option-strip-item",
            active && "is-active",
            buttonClassName,
          )}
          onClick={() => {
            if (
              !shouldHandleOptionStripChange(option.value, value, option.disabled)
            ) {
              return
            }
            onChange?.(option.value)
          }}
        >
          {option.label}
        </Button>
      )
    })}
  </div>
)
