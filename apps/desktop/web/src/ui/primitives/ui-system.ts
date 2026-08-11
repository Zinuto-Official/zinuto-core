// SPDX-License-Identifier: GPL-3.0-only

import { cva } from "class-variance-authority"

export const uiInteractiveTransitionClassName =
  "transition-[background-color,border-color,color,box-shadow,opacity,transform]"

export const uiOverlayMotionClassName = [
  "transition-opacity",
  "duration-[var(--motion-overlay-duration)]",
  "ease-[var(--motion-overlay-ease)]",
  "data-[state=open]:animate-in",
  "data-[state=open]:fade-in-0",
  "data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0",
].join(" ")

export const uiModalMotionClassName = [
  "transition-[opacity,transform]",
  "duration-[var(--motion-overlay-duration)]",
  "ease-[var(--motion-overlay-ease)]",
  "will-change-[transform,opacity]",
  "data-[state=open]:animate-in",
  "data-[state=open]:fade-in-0",
  "data-[state=open]:zoom-in-95",
  "data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0",
  "data-[state=closed]:zoom-out-95",
].join(" ")

export const uiSheetMotionClassName = [
  "transition-[opacity,transform]",
  "duration-[var(--motion-overlay-duration)]",
  "ease-[var(--motion-overlay-ease)]",
  "will-change-[transform,opacity]",
  "data-[state=open]:animate-in",
  "data-[state=open]:fade-in-0",
  "data-[state=open]:slide-in-from-right-full",
  "data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0",
  "data-[state=closed]:slide-out-to-right-full",
].join(" ")

export const uiAnchoredFloatMotionClassName = [
  "transition-[opacity,transform]",
  "duration-[var(--motion-anchored-float-duration)]",
  "ease-[var(--motion-anchored-float-ease)]",
  "will-change-[transform,opacity]",
  "data-[state=open]:animate-in",
  "data-[state=open]:fade-in-0",
  "data-[state=open]:zoom-in-95",
  "data-[state=delayed-open]:animate-in",
  "data-[state=delayed-open]:fade-in-0",
  "data-[state=delayed-open]:zoom-in-95",
  "data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0",
  "data-[state=closed]:zoom-out-95",
  "data-[side=bottom]:slide-in-from-top-2",
  "data-[side=left]:slide-in-from-right-2",
  "data-[side=right]:slide-in-from-left-2",
  "data-[side=top]:slide-in-from-bottom-2",
].join(" ")

export const uiInteractiveFocusClassName =
  "focus-visible:border-[color:var(--ui-field-border-strong)] focus-visible:ring-3 focus-visible:ring-[color:var(--ui-control-focus-ring)]"

export const uiFieldShellVariants = cva(
  [
    "w-full min-w-0 border border-[color:var(--ui-field-border)] bg-[color:var(--ui-field-bg)] text-[color:var(--text)] outline-none",
    "rounded-[var(--ui-radius-control)]",
    "placeholder:text-[color:var(--text-disabled)]",
    "hover:border-[color:var(--ui-field-border-strong)] hover:bg-[color:var(--ui-field-hover-bg)]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-[color:var(--text-disabled)] disabled:opacity-100",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    uiInteractiveTransitionClassName,
    uiInteractiveFocusClassName,
  ].join(" "),
  {
    variants: {
      density: {
        compact:
          "h-[var(--ui-size-control-compact)] px-[var(--ui-space-control-x-compact)] text-r2",
        default:
          "h-[var(--ui-size-control-default)] px-[var(--ui-space-control-x-default)] text-r2",
        large:
          "h-[var(--ui-size-control-large)] px-[var(--ui-space-control-x-large)] text-r3",
      },
      multiline: {
        false: "py-0",
        true:
          "min-h-[calc(var(--ui-size-control-default)*2.5)] px-[var(--ui-space-control-x-default)] py-[var(--ui-space-control-y-field)] leading-relaxed",
      },
    },
    defaultVariants: {
      density: "default",
      multiline: false,
    },
  },
)

export const uiFloatingSurfaceClassName = [
  "rounded-[var(--ui-radius-floating)]",
  "border border-[color:var(--ui-float-border)] bg-[color:var(--ui-float-bg)]",
  "shadow-[var(--shadow-float)]",
].join(" ")

export const uiFloatingMenuContentClassName = [
  "z-[1300] min-w-[11rem] overflow-hidden p-1",
  uiFloatingSurfaceClassName,
].join(" ")

export const uiFloatingMenuScrollableContentClassName = [
  "z-[1300] min-w-[11rem] overflow-y-auto overflow-x-hidden p-1",
  uiFloatingSurfaceClassName,
].join(" ")

export const uiFloatingMenuItemClassName = [
  "relative flex min-h-[var(--ui-size-control-default)] cursor-default items-center gap-2 rounded-[calc(var(--ui-radius-control)-1px)] px-2.5 py-1.5 text-r2 text-[color:var(--ui-text-action-fg)] outline-none select-none",
  "data-[disabled]:pointer-events-none data-[disabled]:text-[color:var(--ui-action-disabled-text)] data-[disabled]:opacity-100",
  "data-[highlighted]:bg-[color:var(--ui-float-row-hover)] data-[highlighted]:text-[color:var(--text-strong)]",
  "[&_svg]:pointer-events-none [&_svg:not([class*='text-'])]:text-[color:var(--ui-text-action-fg)] [&_svg:not([class*='size-'])]:size-4",
  uiInteractiveTransitionClassName,
].join(" ")

export const uiFloatingMenuCheckedItemClassName = [
  "relative flex min-h-[var(--ui-size-control-default)] cursor-default items-center gap-2 rounded-[calc(var(--ui-radius-control)-1px)] py-1.5 pr-2.5 pl-8 text-r2 text-[color:var(--ui-text-action-fg)] outline-none select-none",
  "data-[disabled]:pointer-events-none data-[disabled]:text-[color:var(--ui-action-disabled-text)] data-[disabled]:opacity-100",
  "data-[highlighted]:bg-[color:var(--ui-float-row-hover)] data-[highlighted]:text-[color:var(--text-strong)]",
  "data-[state=checked]:bg-[color:var(--ui-float-row-active)] data-[state=checked]:text-[color:var(--text-strong)]",
  uiInteractiveTransitionClassName,
].join(" ")

export const uiModalSurfaceClassName = [
  "rounded-[var(--ui-radius-floating)]",
  "border border-[color:var(--ui-modal-border)] bg-[color:var(--ui-modal-bg)]",
  "shadow-[var(--shadow-float)]",
].join(" ")

export const uiSurfaceCardClassName = [
  "rounded-[var(--ui-radius-surface)]",
  "border border-[color:var(--ui-surface-border-soft)] bg-[color:var(--ui-surface-bg)]",
].join(" ")

export const uiSoftSurfaceCardClassName = [
  "rounded-[var(--ui-radius-surface)]",
  "border border-[color:var(--ui-surface-border-soft)] bg-[color:var(--ui-surface-soft)]",
].join(" ")

export const uiPillClassName = "rounded-[var(--ui-radius-pill)]"
