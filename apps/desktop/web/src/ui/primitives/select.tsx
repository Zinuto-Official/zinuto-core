// SPDX-License-Identifier: GPL-3.0-only

"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";

import { VendorIcon } from "@/assets/graphics/AppIcons";
import { cn } from "@/ui/cn";
import {
  uiAnchoredFloatMotionClassName,
  uiFieldShellVariants,
  uiFloatingSurfaceClassName,
  uiInteractiveTransitionClassName,
} from "@/ui/primitives/ui-system";
import { useAppPortalContainer } from "@/ui/primitives/portalContainer";

const Select = SelectPrimitive.Root;
const SELECT_CONTENT_MAX_HEIGHT =
  "min(var(--radix-select-content-available-height, 16rem), var(--ui-select-content-max-height, 16rem))";
const SELECT_VIEWPORT_MAX_HEIGHT =
  "max(0px, calc(var(--ui-select-resolved-content-max-height) - 12px))";

function SelectPortal({
  container,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Portal>) {
  const resolvedContainer = useAppPortalContainer(container);
  return (
    <SelectPrimitive.Portal
      data-slot="select-portal"
      container={resolvedContainer}
      {...props}
    />
  );
}

function SelectGroup(
  props: React.ComponentProps<typeof SelectPrimitive.Group>,
) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />;
}

function SelectValue({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      data-i18n-slot="selectValue"
      className={cn(
        "flex min-w-0 flex-1 self-center overflow-hidden text-left text-ellipsis whitespace-nowrap leading-normal",
        className,
      )}
      {...props}
    />
  );
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & {
    density?: "compact" | "default" | "large";
  }
>(({ className, density = "default", children, ...props }, ref) => {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-density={density}
      className={cn(
        uiFieldShellVariants({
          density:
            density === "compact"
              ? "compact"
              : density === "large"
                ? "large"
                : "default",
        }),
        "flex w-fit items-center justify-between gap-1.5 overflow-hidden pr-2 data-[placeholder]:text-[color:var(--text-disabled)] disabled:text-[color:var(--ui-action-disabled-text)] disabled:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <VendorIcon
          name="chevronDown"
          className="pointer-events-none size-4 self-center text-[color:var(--ui-text-action-fg)]"
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});
SelectTrigger.displayName = "SelectTrigger";

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    alignItemWithTrigger?: boolean;
  }
>(
  (
    {
      className,
      children,
      style,
      side = "bottom",
      sideOffset = 4,
      align = "center",
      alignOffset = 0,
      alignItemWithTrigger = true,
      ...props
    },
    ref,
  ) => {
    return (
      <SelectPortal>
        <SelectPrimitive.Content
          ref={ref}
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            `relative isolate z-[1300] w-[var(--radix-select-trigger-width)] min-w-[max(var(--radix-select-trigger-width),15rem)] max-w-[min(28rem,calc(100vw-24px))] origin-[var(--radix-select-content-transform-origin)] overflow-hidden text-[color:var(--text)] ${uiFloatingSurfaceClassName}`,
            uiAnchoredFloatMotionClassName,
            className,
          )}
          style={
            {
              "--ui-select-resolved-content-max-height":
                SELECT_CONTENT_MAX_HEIGHT,
              maxHeight: "var(--ui-select-resolved-content-max-height)",
              ...style,
            } as React.CSSProperties
          }
          position="popper"
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.Viewport
            data-slot="select-viewport"
            className="p-1"
            style={{
              maxHeight: SELECT_VIEWPORT_MAX_HEIGHT,
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            {children}
          </SelectPrimitive.Viewport>
          <SelectScrollDownButton />
        </SelectPrimitive.Content>
      </SelectPortal>
    );
  },
);
SelectContent.displayName = "SelectContent";

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Label
      ref={ref}
      data-slot="select-label"
      className={cn("px-2 py-1 text-r1 font-semibold tracking-[0.04em] text-[color:var(--ui-text-action-fg)]", className)}
      {...props}
    />
  );
});
SelectLabel.displayName = "SelectLabel";

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => {
  return (
    <SelectPrimitive.Item
      ref={ref}
      data-slot="select-item"
      className={cn(
        `relative flex min-h-[var(--ui-size-control-default)] w-full cursor-default items-center gap-2 rounded-[calc(var(--ui-radius-control)-1px)] py-1.5 pr-8 pl-3 text-r2 text-[color:var(--ui-text-action-fg)] outline-none select-none before:absolute before:left-1 before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-transparent data-[disabled]:pointer-events-none data-[disabled]:text-[color:var(--ui-action-disabled-text)] data-[disabled]:opacity-100 data-[highlighted]:bg-[color:var(--ui-float-row-hover)] data-[highlighted]:text-[color:var(--text-strong)] data-[state=checked]:bg-[color:var(--ui-float-row-active)] data-[state=checked]:text-[color:var(--text-strong)] data-[state=checked]:before:bg-[color:var(--ui-row-rail)] ${uiInteractiveTransitionClassName}`,
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText
        className="flex min-w-0 flex-1 self-center gap-2 whitespace-normal break-words leading-tight"
        data-i18n-slot="selectValue"
      >
        {children}
      </SelectPrimitive.ItemText>
      <span
        data-slot="select-item-indicator"
        className="pointer-events-none absolute top-1/2 right-2 flex size-4 -translate-y-1/2 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <VendorIcon name="check" />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  );
});
SelectItem.displayName = "SelectItem";

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-[color:var(--ui-float-divider)]", className)}
      {...props}
    />
  );
});
SelectSeparator.displayName = "SelectSeparator";

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      data-slot="select-scroll-up-button"
      className={cn(
        "top-0 z-10 flex w-full cursor-default items-center justify-center bg-[color:var(--ui-float-bg)] py-1 text-[color:var(--ui-text-action-fg)] [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <VendorIcon name="chevronUp" />
    </SelectPrimitive.ScrollUpButton>
  );
});
SelectScrollUpButton.displayName = "SelectScrollUpButton";

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => {
  return (
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      data-slot="select-scroll-down-button"
      className={cn(
        "bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-[color:var(--ui-float-bg)] py-1 text-[color:var(--ui-text-action-fg)] [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <VendorIcon name="chevronDown" />
    </SelectPrimitive.ScrollDownButton>
  );
});
SelectScrollDownButton.displayName = "SelectScrollDownButton";

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
};
