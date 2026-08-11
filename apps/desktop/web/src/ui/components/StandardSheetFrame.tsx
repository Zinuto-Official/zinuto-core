// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode, Ref } from "react";
import { cn } from "@/ui/cn";

type StandardSheetFrameProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
  headerClassName?: string;
  bodyRef?: Ref<HTMLDivElement>;
};

export const StandardSheetFrame = ({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  footerClassName,
  headerClassName,
  bodyRef,
}: StandardSheetFrameProps) => (
  <div className={cn("ui-standard-sheet", className)}>
    <div className={cn("ui-standard-sheet-header", headerClassName)}>
      <div className="ui-standard-sheet-title">{title}</div>
      {description ? (
        <div className="ui-standard-sheet-description">{description}</div>
      ) : null}
    </div>
    {children ? (
      <div ref={bodyRef} className={cn("ui-standard-sheet-body", bodyClassName)}>
        {children}
      </div>
    ) : null}
    {actions ? (
      <div className={cn("ui-standard-sheet-actions", footerClassName)}>
        {actions}
      </div>
    ) : null}
  </div>
);
