// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react"
import { cn } from "@/ui/cn"

type StandardModalFrameVariant = "alert" | "form" | "workflow" | "custom"
type StandardModalFooterMode = "end" | "between"

type StandardModalFrameProps = {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  variant?: StandardModalFrameVariant
  footerMode?: StandardModalFooterMode
  className?: string
  headerClassName?: string
  bodyClassName?: string
  footerClassName?: string
}

export const StandardModalFrame = ({
  title,
  description,
  actions,
  children,
  variant = "custom",
  footerMode = "end",
  className,
  headerClassName,
  bodyClassName,
  footerClassName,
}: StandardModalFrameProps) => (
  <div className={cn("ui-standard-modal", className)} data-variant={variant}>
    <div className={cn("ui-standard-modal-header", headerClassName)}>
      <div className="ui-standard-modal-title">{title}</div>
      {description ? (
        <div className="ui-standard-modal-description">{description}</div>
      ) : null}
    </div>
    {children ? (
      <div className={cn("ui-standard-modal-body", bodyClassName)}>
        {children}
      </div>
    ) : null}
    {actions ? (
      <div
        className={cn("ui-standard-modal-actions", footerClassName)}
        data-footer-mode={footerMode}
      >
        {actions}
      </div>
    ) : null}
  </div>
)
