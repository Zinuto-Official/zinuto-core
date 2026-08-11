// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

import { Button } from "@/ui/primitives/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/ui/primitives/dropdown-menu";
import { cn } from "@/ui/cn";
import { ttf } from "@/frontend-kernel/i18n/messageRuntime";

export type MultiSelectOption = {
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
};

type MultiSelectProps = {
  "aria-label"?: string;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  emptyLabel?: React.ReactNode;
  onValuesChange: (values: string[]) => void;
  options: readonly MultiSelectOption[];
  placeholder?: React.ReactNode;
  values: readonly string[];
};

export const MultiSelect = ({
  "aria-label": ariaLabel,
  className,
  contentClassName,
  disabled,
  emptyLabel,
  onValuesChange,
  options,
  placeholder = null,
  values,
}: MultiSelectProps) => {
  const valueSet = React.useMemo(() => new Set(values), [values]);
  const selectedLabels = options
    .filter((option) => valueSet.has(option.value))
    .map((option) => option.label);
  const triggerLabel =
    selectedLabels.length > 0
      ? selectedLabels.length === 1
        ? selectedLabels[0]
        : ttf("appText.value0Selected2", [selectedLabels.length])
      : emptyLabel ?? placeholder;

  const toggleValue = (value: string, checked: boolean) => {
    const nextValueSet = new Set(values);
    if (checked) {
      nextValueSet.add(value);
    } else {
      nextValueSet.delete(value);
    }
    onValuesChange(Array.from(nextValueSet));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="field"
          className={cn("ui-multi-select-trigger", className)}
          disabled={disabled}
          aria-label={ariaLabel}
        >
          <span data-slot="multi-select-value">{triggerLabel}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn("ui-multi-select-content", contentClassName)}
        align="start"
      >
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={valueSet.has(option.value)}
            disabled={option.disabled}
            onCheckedChange={(checked) =>
              toggleValue(option.value, Boolean(checked))
            }
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
