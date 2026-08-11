// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { CardAction, CardContent, CardHeader, CardTitle } from "@/ui/primitives/card";
import { SoftSurfaceCard, SurfaceCard } from "@/ui/primitives/surface-card";
import { VendorIcon, type VendorIconName } from "@/assets/graphics";
import { cn } from "@/ui/cn";

type SettingsPanelCardTone =
  | "default"
  | "accent"
  | "positive"
  | "warning"
  | "danger"
  | "neutral";

type SettingsPanelCardProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  value?: ReactNode;
  iconName?: VendorIconName;
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  tone?: SettingsPanelCardTone;
  soft?: boolean;
};

export const SettingsPanelCard = ({
  eyebrow,
  title,
  description,
  value,
  iconName,
  action,
  footer,
  children,
  className,
  bodyClassName,
  tone = "default",
  soft = false,
}: SettingsPanelCardProps) => {
  const CardComponent = soft ? SoftSurfaceCard : SurfaceCard;

  return (
    <CardComponent
      className={cn(
        "settings-panel-card",
        `tone-${tone}`,
        soft && "is-soft",
        className,
      )}
      size="sm"
    >
      <CardHeader className="settings-panel-card-header">
        <div className="settings-panel-card-copy">
          {eyebrow ? (
            <span className="settings-panel-card-eyebrow">{eyebrow}</span>
          ) : null}
          <div className="settings-panel-card-title-row">
            {iconName ? (
              <span className="settings-panel-card-icon" aria-hidden="true">
                <VendorIcon name={iconName} />
              </span>
            ) : null}
            <CardTitle className="settings-panel-card-title">{title}</CardTitle>
          </div>
          {description ? (
            <p className="settings-panel-card-description">{description}</p>
          ) : null}
        </div>
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      {value || children ? (
        <CardContent className={cn("settings-panel-card-body", bodyClassName)}>
          {value ? <strong className="settings-panel-card-value">{value}</strong> : null}
          {children}
        </CardContent>
      ) : null}
      {footer ? <div className="settings-panel-card-footer">{footer}</div> : null}
    </CardComponent>
  );
};

type SettingsStatusPillProps = {
  children: ReactNode;
  tone?: SettingsPanelCardTone;
  className?: string;
};

export const SettingsStatusPill = ({
  children,
  tone = "neutral",
  className,
}: SettingsStatusPillProps) => (
  <span
    className={cn("settings-status-pill", `tone-${tone}`, className)}
  >
    {children}
  </span>
);
