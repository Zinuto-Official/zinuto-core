// SPDX-License-Identifier: GPL-3.0-only

import type { HTMLAttributes, ReactNode } from "react";
import { AppIcon } from "@/assets/graphics";
import { cn } from "@/ui/cn";

type FeatureLockIconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children">;

export const FeatureLockIcon = ({
  className,
  ...props
}: FeatureLockIconProps) => {
  const ariaHidden = props["aria-hidden"] ?? true;
  return (
    <span
      {...props}
      aria-hidden={ariaHidden}
      className={cn("feature-lock-indicator", className)}
    >
      <AppIcon name="statusLock" />
    </span>
  );
};

type FeatureLockLabelProps = {
  children: ReactNode;
  className?: string;
  lockClassName?: string;
  locked?: boolean;
};

export const FeatureLockLabel = ({
  children,
  className,
  lockClassName,
  locked = false,
}: FeatureLockLabelProps) => (
  <span className={cn("feature-lock-label", className)}>
    {children}
    {locked ? <FeatureLockIcon className={lockClassName} /> : null}
  </span>
);
