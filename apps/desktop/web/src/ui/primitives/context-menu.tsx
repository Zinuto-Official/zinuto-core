// SPDX-License-Identifier: GPL-3.0-only

"use client";

import * as React from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";

import { VendorIcon } from "@/assets/graphics/AppIcons";
import { cn } from "@/ui/cn";
import {
  ZINUTO_CONTEXT_MENU_TRIGGER_ATTRIBUTE,
  ZINUTO_CONTEXT_MENU_TRIGGER_VALUE,
} from "@/ui/desktopInteractionPolicy";
import {
  uiAnchoredFloatMotionClassName,
  uiFloatingMenuCheckedItemClassName,
  uiFloatingMenuContentClassName,
  uiFloatingMenuItemClassName,
  uiFloatingMenuScrollableContentClassName,
} from "@/ui/primitives/ui-system";
import { useAppPortalContainer } from "@/ui/primitives/portalContainer";

const contextMenuTriggerDataAttributes = {
  [ZINUTO_CONTEXT_MENU_TRIGGER_ATTRIBUTE]: ZINUTO_CONTEXT_MENU_TRIGGER_VALUE,
};

function ContextMenu(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Root>,
) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>,
) {
  return (
    <ContextMenuPrimitive.Trigger
      {...props}
      data-slot="context-menu-trigger"
      {...contextMenuTriggerDataAttributes}
    />
  );
}

function ContextMenuPortal({
  container,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  const resolvedContainer = useAppPortalContainer(container);
  return (
    <ContextMenuPrimitive.Portal
      data-slot="context-menu-portal"
      container={resolvedContainer}
      {...props}
    />
  );
}

const ContextMenuSub = ContextMenuPrimitive.Sub;

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    data-slot="context-menu-sub-trigger"
    data-inset={inset}
    className={cn(
      uiFloatingMenuItemClassName,
      "data-[inset]:pl-8 data-[state=open]:bg-[color:var(--ui-float-row-active)] data-[state=open]:text-[color:var(--text-strong)]",
      className,
    )}
    {...props}
  >
    {children}
    <VendorIcon name="chevronRight" className="ml-auto size-4" />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName =
  ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.SubContent
      ref={ref}
      data-slot="context-menu-sub-content"
      className={cn(
        uiFloatingMenuContentClassName,
        uiAnchoredFloatMotionClassName,
        className,
      )}
      {...props}
    />
  </ContextMenuPortal>
));
ContextMenuSubContent.displayName =
  ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPortal>
    <ContextMenuPrimitive.Content
      ref={ref}
      data-slot="context-menu-content"
      className={cn(
        "max-h-[var(--radix-context-menu-content-available-height)]",
        uiFloatingMenuScrollableContentClassName,
        uiAnchoredFloatMotionClassName,
        className,
      )}
      {...props}
    />
  </ContextMenuPortal>
));
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    data-slot="context-menu-item"
    data-inset={inset}
    className={cn(
      uiFloatingMenuItemClassName,
      "data-[inset]:pl-8",
      className,
    )}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    data-slot="context-menu-checkbox-item"
    className={cn(
      uiFloatingMenuCheckedItemClassName,
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <VendorIcon name="check" className="size-4" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    data-slot="context-menu-label"
    data-inset={inset}
    className={cn(
      "px-2.5 py-1.5 text-r1 font-semibold tracking-[0.04em] text-[color:var(--ui-text-action-fg)] data-[inset]:pl-8",
      className,
    )}
    {...props}
  />
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    data-slot="context-menu-separator"
    className={cn("-mx-1 my-1 h-px bg-[color:var(--ui-float-divider)]", className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
