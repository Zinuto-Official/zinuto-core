// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { cn } from "@/ui/cn";

type WorkspaceSectionProps = {
  id?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  onboardingTargetId?: string;
  shell?: boolean;
  tabIndex?: number;
};

export const WorkspaceSection = ({
  id,
  title,
  subtitle,
  actions,
  children,
  className,
  headerClassName,
  bodyClassName,
  onboardingTargetId,
  shell = false,
  tabIndex,
}: WorkspaceSectionProps) => {
  const hasHeader = Boolean(title || subtitle || actions);
  return (
    <section
      id={id}
      tabIndex={tabIndex}
      data-page-slot="section"
      data-onboarding-target={onboardingTargetId}
      className={cn("workspace-section", shell && "is-shell", className)}
    >
      {hasHeader ? (
        <header className={cn("workspace-section-head", headerClassName)}>
          <div className="workspace-section-copy">
            {title ? <h3 className="workspace-section-title">{title}</h3> : null}
            {subtitle ? (
              <p className="workspace-section-subtitle">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="workspace-section-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div
        className={cn(
          "workspace-section-body",
          hasHeader && "has-header",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
};
