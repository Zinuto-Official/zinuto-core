// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";

import { cn } from "@/ui/cn";

type CheckboxProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
  density?: "compact" | "default" | "large";
};

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, density = "default", ...props }, ref) => (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      data-slot="checkbox"
      data-density={density}
      className={cn("app-checkbox", className)}
    />
  ),
);

Checkbox.displayName = "Checkbox";
