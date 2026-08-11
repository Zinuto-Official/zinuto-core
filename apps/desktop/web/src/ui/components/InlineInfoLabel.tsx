// SPDX-License-Identifier: GPL-3.0-only

import { Button } from "@/ui/primitives/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/ui/primitives/tooltip";
import { VendorIcon } from "@/assets/graphics";
import { cn } from "@/ui/cn";

type InlineInfoLabelProps = {
  label: string;
  tooltip?: string;
  critical?: boolean;
  className?: string;
};

export const InlineInfoLabel = ({
  label,
  tooltip,
  critical = false,
  className,
}: InlineInfoLabelProps) => {
  const labelNode = (
    <span
      className="min-w-0 leading-snug"
      data-i18n-slot="inlineInfoText"
      data-i18n-critical={critical ? "true" : undefined}
    >
      {label}
    </span>
  );

  if (!tooltip) {
    return labelNode;
  }

  return (
    <span
      className={cn("inline-flex max-w-full flex-wrap items-center gap-1", className)}
      data-i18n-slot="inlineInfoLabel"
    >
      {labelNode}
      <Tooltip delay={0}>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            data-inline-info-trigger="true"
            className="inline-flex size-4 shrink-0 appearance-none items-center justify-center border-0 bg-transparent p-0 text-[color:var(--text-subtle)] shadow-none outline-none hover:bg-transparent hover:text-[color:var(--text-strong)] focus-visible:ring-2 focus-visible:ring-[color:var(--ui-control-focus-ring)]"
            style={{ background: "transparent", border: 0, boxShadow: "none", padding: 0 }}
            aria-label={tooltip}
          >
            <VendorIcon
              name="circleHelp"
              width={14}
              height={14}
              style={{ width: 14, height: 14 }}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={6} className="max-w-64 leading-relaxed">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </span>
  );
};
