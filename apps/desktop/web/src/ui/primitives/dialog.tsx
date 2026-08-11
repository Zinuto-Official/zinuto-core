// SPDX-License-Identifier: GPL-3.0-only

"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "@/ui/cn";
import { Button } from "@/ui/primitives/button";
import { VendorIcon } from "@/assets/graphics/AppIcons";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import {
  uiModalMotionClassName,
  uiModalSurfaceClassName,
  uiOverlayMotionClassName,
  uiSheetMotionClassName,
} from "@/ui/primitives/ui-system";
import { useAppPortalContainer } from "@/ui/primitives/portalContainer";

export type DialogSurfacePreset = "alert" | "form" | "workflow" | "custom";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogPortal({
  container,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  const resolvedContainer = useAppPortalContainer(container);
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      container={resolvedContainer}
      {...props}
    />
  );
}

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        "app-dialog-overlay fixed inset-0 isolate z-[1200]",
        uiOverlayMotionClassName,
        className,
      )}
      {...props}
    />
  );
});
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    showCloseButton?: boolean;
    layout?: "modal" | "sheet-right";
    preset?: DialogSurfacePreset;
    overlayClassName?: string;
    portalContainer?: HTMLElement;
    accessibilityTitle?: React.ReactNode;
    accessibilityDescription?: React.ReactNode | null;
  }
>(
  (
    {
      className,
      children,
      showCloseButton = true,
      layout = "modal",
      preset = "custom",
      overlayClassName,
      portalContainer,
      accessibilityTitle,
      accessibilityDescription,
      ...props
    },
    ref,
  ) => {
    const contentProps =
      accessibilityDescription === null
        ? { "aria-describedby": undefined, ...props }
        : props;

    return (
      <DialogPortal container={portalContainer}>
        <DialogOverlay className={overlayClassName} />
        <DialogPrimitive.Content
          ref={ref}
          data-slot="dialog-content"
          data-layout={layout}
          data-preset={layout === "modal" ? preset : undefined}
          className={cn(
            layout === "sheet-right"
              ? "app-dialog-content fixed top-0 right-0 z-[1210] grid h-screen w-[min(560px,calc(100vw-12px))] gap-3 overflow-hidden overscroll-contain rounded-none border-y-0 border-r-0 border-l border-[color:var(--ui-modal-border)] bg-[color:var(--ui-modal-bg)] p-4 text-r2 shadow-[var(--shadow-float)] outline-none"
              : `app-dialog-content fixed top-1/2 left-1/2 z-[1210] grid w-[min(960px,calc(100vw-24px))] max-h-[calc(100vh-24px)] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-hidden overscroll-contain p-4 text-r2 outline-none ${uiModalSurfaceClassName}`,
            layout === "sheet-right" ? uiSheetMotionClassName : uiModalMotionClassName,
            className,
          )}
          {...contentProps}
        >
          {accessibilityTitle ? (
            <DialogPrimitive.Title className="sr-only">
              {accessibilityTitle}
            </DialogPrimitive.Title>
          ) : null}
          {accessibilityDescription ? (
            <DialogPrimitive.Description className="sr-only">
              {accessibilityDescription}
            </DialogPrimitive.Description>
          ) : null}
          {children}
          {showCloseButton ? (
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                className="app-dialog-close absolute top-2.5 right-2.5"
                size="icon-sm"
                aria-label={tt("appText.cancel")}
              >
                <VendorIcon name="x" />
              </Button>
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = "DialogContent";

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      data-i18n-slot="dialogFooter"
      className={cn(
        "-mx-4 -mb-4 flex flex-wrap items-stretch justify-end gap-2 border-t border-[color:var(--ui-divider)] bg-[color:var(--ui-surface-soft)] p-4",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{tt("appText.cancel")}</Button>
        </DialogPrimitive.Close>
      ) : null}
    </div>
  );
}

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn(
        "text-r3 leading-tight font-semibold text-[color:var(--text-strong)]",
        className,
      )}
      {...props}
    />
  );
});
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn(
        "text-r2 leading-relaxed text-[color:var(--ui-text-action-fg)] *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-[color:var(--text-strong)]",
        className,
      )}
      {...props}
    />
  );
});
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
};
