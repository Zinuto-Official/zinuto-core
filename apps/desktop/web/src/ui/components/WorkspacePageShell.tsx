// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties, ReactNode } from "react";
import { PageContainer } from "@/ui/components/PageContainer";
import { WorkspacePageBody } from "@/ui/components/WorkspacePageBody";
import { cn } from "@/ui/cn";
import type { PageLayoutTemplate } from "@/ui/components/pageLayoutTypes";

type WorkspacePageShellStyle = CSSProperties & {
  "--workspace-page-shell-rows"?: string;
};

type WorkspacePageShellProps = {
  template: PageLayoutTemplate;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  header?: ReactNode;
  toolbar?: ReactNode;
  summary?: ReactNode;
  footer?: ReactNode;
  style?: WorkspacePageShellStyle;
};

export const WorkspacePageShell = ({
  template,
  children,
  className,
  bodyClassName,
  header,
  toolbar,
  summary,
  footer,
  style,
}: WorkspacePageShellProps) => {
  const shellRowTemplate = [
    header ? "auto" : null,
    toolbar ? "auto" : null,
    summary ? "auto" : null,
    "minmax(0, 1fr)",
    footer ? "auto" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const shellStyle: WorkspacePageShellStyle = {
    ...style,
    "--workspace-page-shell-rows": shellRowTemplate,
  };

  return (
    <PageContainer
      template={template}
      className={cn("workspace-page-shell", className)}
      style={shellStyle}
    >
      {header ? <div data-page-slot="page-header">{header}</div> : null}
      {toolbar ? <div data-page-slot="page-toolbar">{toolbar}</div> : null}
      {summary ? <div data-page-slot="page-summary">{summary}</div> : null}
      <WorkspacePageBody className={bodyClassName}>{children}</WorkspacePageBody>
      {footer ? <div data-page-slot="page-footer">{footer}</div> : null}
    </PageContainer>
  );
};
