// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { Button } from "@/ui/primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { VendorIcon } from "@/assets/graphics";
import { cn } from "@/ui/cn";

type SettingRowProps = {
  title: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  unit?: ReactNode;
  helperTooltip?: ReactNode;
  controlFill?: boolean;
  className?: string;
};

export const SettingRow = ({
  title,
  description,
  control,
  unit,
  helperTooltip,
  controlFill = false,
  className,
}: SettingRowProps) => (
  <div className={cn("settings-modern-row", className)} data-i18n-slot="settingRow">
    <div className="settings-row-copy min-w-0" data-i18n-slot="settingCopy">
      <div className="settings-row-title-wrap">
        <div
          className="settings-row-title text-r2 font-medium"
          data-i18n-slot="settingTitle"
          data-i18n-critical="true"
        >
          {title}
        </div>
        {helperTooltip ? (
          <Tooltip delay={0}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="settings-row-help-trigger"
              >
                <VendorIcon
                  name="circleHelp"
                  className="settings-row-help-icon"
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>{helperTooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {description ? (
        <div
          className="settings-row-desc text-r1 text-muted-foreground"
          data-i18n-slot="settingDesc"
          data-i18n-critical="true"
        >
          {description}
        </div>
      ) : null}
    </div>
    <div
      className={cn("settings-row-control", controlFill && "is-fill")}
      data-i18n-slot="settingControl"
    >
      <div className="settings-row-control-inner">{control}</div>
      {unit ? <span className="settings-row-unit">{unit}</span> : null}
    </div>
  </div>
);
