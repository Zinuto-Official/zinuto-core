// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

import { cn } from "@/ui/cn";

type SwitchProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "onChange" | "role"
> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: "sm" | "md" | "lg";
};

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      className,
      defaultChecked = false,
      disabled,
      onCheckedChange,
      onClick,
      size = "md",
      ...props
    },
    ref,
  ) => {
    const [uncontrolledChecked, setUncontrolledChecked] =
      React.useState(defaultChecked);
    const resolvedChecked = checked ?? uncontrolledChecked;

    return (
      <button
        {...props}
        ref={ref}
        type="button"
        role="switch"
        data-slot="switch"
        data-size={size}
        data-state={resolvedChecked ? "checked" : "unchecked"}
        aria-checked={resolvedChecked}
        disabled={disabled}
        className={cn("ui-switch", className)}
        onClick={(event) => {
          onClick?.(event);
          if (event.defaultPrevented || disabled) {
            return;
          }
          const nextChecked = !resolvedChecked;
          if (checked === undefined) {
            setUncontrolledChecked(nextChecked);
          }
          onCheckedChange?.(nextChecked);
        }}
      >
        <span data-slot="switch-track">
          <span data-slot="switch-thumb" />
        </span>
      </button>
    );
  },
);

Switch.displayName = "Switch";
