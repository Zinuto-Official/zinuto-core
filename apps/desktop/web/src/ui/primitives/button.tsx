// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/ui/cn"
import { Spinner } from "@/ui/primitives/loading"
import { uiInteractiveTransitionClassName } from "@/ui/primitives/ui-system"

const buttonVariants = cva(
  [
    "group/button inline-flex min-w-0 shrink-0 cursor-pointer items-center justify-center border border-transparent bg-transparent bg-clip-padding whitespace-nowrap text-center outline-none select-none",
    "rounded-[var(--ui-radius-control)]",
    "text-r2 font-semibold",
    "focus-visible:border-[color:var(--ui-action-border-strong)] focus-visible:ring-3 focus-visible:ring-[color:var(--ui-control-focus-ring)]",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-100",
    "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    uiInteractiveTransitionClassName,
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-[color:var(--ui-action-bg)] bg-[color:var(--ui-action-bg)] text-[color:var(--ui-action-text)] hover:border-[color:var(--ui-action-bg-hover)] hover:bg-[color:var(--ui-action-bg-hover)] active:border-[color:var(--ui-action-bg-press)] active:bg-[color:var(--ui-action-bg-press)] disabled:border-[color:var(--ui-action-disabled-border)] disabled:bg-[color:var(--ui-action-disabled-bg)] disabled:text-[color:var(--ui-action-disabled-text)]",
        outline:
          "border-[color:var(--ui-action-border)] bg-[color:var(--ui-action-quiet-bg)] text-[color:var(--text)] hover:border-[color:var(--ui-action-border-strong)] hover:bg-[color:var(--ui-action-quiet-hover)] aria-expanded:border-[color:var(--ui-action-border-strong)] aria-expanded:bg-[color:var(--ui-action-quiet-hover)] disabled:border-[color:var(--ui-action-disabled-border)] disabled:bg-[color:var(--ui-action-disabled-bg)] disabled:text-[color:var(--ui-action-disabled-text)]",
        secondary:
          "border-[color:var(--ui-action-quiet-border)] bg-[color:var(--ui-action-quiet-bg)] text-[color:var(--text)] hover:border-[color:var(--ui-action-quiet-border-hover)] hover:bg-[color:var(--ui-action-quiet-hover)] aria-expanded:border-[color:var(--ui-action-quiet-border-hover)] aria-expanded:bg-[color:var(--ui-action-quiet-hover)] disabled:border-[color:var(--ui-action-disabled-border)] disabled:bg-[color:var(--ui-action-disabled-bg)] disabled:text-[color:var(--ui-action-disabled-text)]",
        ghost:
          "border-transparent bg-transparent text-[color:var(--text)] hover:bg-[color:var(--ui-text-action-hover-bg)] hover:text-[color:var(--text-strong)] aria-expanded:bg-[color:var(--ui-text-action-active-bg)] aria-expanded:text-[color:var(--text-strong)] disabled:bg-transparent disabled:text-[color:var(--ui-action-disabled-text)]",
        destructive:
          "border-[color:var(--visual-danger-solid)] bg-[color:var(--visual-danger-solid)] text-[color:var(--visual-white)] hover:border-[color:var(--visual-danger-solid-hover)] hover:bg-[color:var(--visual-danger-solid-hover)] focus-visible:ring-[color:rgb(var(--color-danger)/0.2)] disabled:border-[color:var(--ui-action-disabled-border)] disabled:bg-[color:var(--ui-action-disabled-bg)] disabled:text-[color:var(--ui-action-disabled-text)]",
        destructiveGhost:
          "border-transparent bg-transparent text-[color:var(--visual-danger-accent)] hover:border-[color:var(--visual-danger-border-soft)] hover:bg-[color:rgb(var(--color-danger)/0.1)] hover:text-[color:var(--visual-danger-solid-hover)] focus-visible:ring-[color:rgb(var(--color-danger)/0.2)] disabled:bg-transparent disabled:text-[color:var(--ui-action-disabled-text)]",
        destructiveInline:
          "h-auto rounded-none border-0 bg-transparent px-0 py-0 text-[color:var(--visual-danger-accent)] hover:bg-transparent hover:text-[color:var(--visual-danger-solid-hover)] focus-visible:ring-0 disabled:text-[color:var(--ui-action-disabled-text)]",
        field:
          "border-[color:var(--ui-field-border)] bg-[color:var(--ui-field-bg)] text-[color:var(--text)] hover:border-[color:var(--ui-field-border-strong)] hover:bg-[color:var(--ui-field-hover-bg)] disabled:border-[color:var(--ui-action-disabled-border)] disabled:bg-[color:var(--ui-action-disabled-bg)] disabled:text-[color:var(--ui-action-disabled-text)]",
        link:
          "h-auto rounded-none border-0 bg-transparent px-0 py-0 text-[color:var(--primary)] underline-offset-4 hover:bg-transparent hover:text-[color:var(--primary-hover)] hover:underline focus-visible:ring-0 disabled:text-[color:var(--ui-action-disabled-text)]",
        inline:
          "h-auto rounded-none border-0 bg-transparent px-0 py-0 text-[color:var(--text)] hover:bg-transparent hover:text-[color:var(--text-strong)] focus-visible:ring-0 disabled:text-[color:var(--ui-action-disabled-text)]",
      },
      size: {
        default:
          "h-[var(--ui-size-control-default)] gap-1.5 px-[var(--ui-space-control-x-default)] has-data-[icon=inline-end]:pr-[calc(var(--ui-space-control-x-default)-2px)] has-data-[icon=inline-start]:pl-[calc(var(--ui-space-control-x-default)-2px)]",
        xs: "h-[var(--ui-size-control-compact)] gap-1 px-[var(--ui-space-control-x-compact)] text-r1 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--ui-size-control-compact)] gap-1 px-[var(--ui-space-control-x-compact)] text-r2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--ui-size-control-large)] gap-1.5 px-[var(--ui-space-control-x-large)] text-r3 has-data-[icon=inline-end]:pr-[calc(var(--ui-space-control-x-large)-1px)] has-data-[icon=inline-start]:pl-[calc(var(--ui-space-control-x-large)-1px)]",
        icon: "size-[var(--ui-size-control-default)]",
        "icon-xs":
          "size-[var(--ui-size-control-compact)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-[var(--ui-size-control-compact)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-[var(--ui-size-control-large)]",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "default",
    },
  }
)

type ButtonDataSlot = "button" | "toolbar-icon-button"

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    dataSlot?: ButtonDataSlot
    loading?: boolean
    loadingLabel?: React.ReactNode
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size = "default",
      asChild = false,
      children,
      dataSlot = "button",
      disabled,
      loading = false,
      loadingLabel,
      onPointerUp,
      onMouseUp,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button"
    const isIconButton = typeof size === "string" && size.startsWith("icon")
    const isLoading = loading
    const shouldWrapPrimitiveContent =
      !asChild && (typeof children === "string" || typeof children === "number")
    const derivedLoadingLabel =
      loadingLabel ??
      (typeof children === "string" || typeof children === "number"
        ? children
        : null)

    const blurCurrentTarget = (target: EventTarget | null) => {
      const element = target as HTMLElement | null
      if (!element || typeof element.blur !== "function") {
        return
      }
      element.blur()
    }

    const handlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
      onPointerUp?.(event)
      if (event.defaultPrevented || event.button !== 0) {
        return
      }
      // Keep keyboard tab-focus behavior, but release focus after mouse/touch activation.
      if (
        event.pointerType === "mouse" ||
        event.pointerType === "pen" ||
        event.pointerType === "touch"
      ) {
        blurCurrentTarget(event.currentTarget)
      }
    }

    const handleMouseUp = (event: React.MouseEvent<HTMLButtonElement>) => {
      onMouseUp?.(event)
      if (event.defaultPrevented || event.button !== 0) {
        return
      }
      blurCurrentTarget(event.currentTarget)
    }

    return (
      <Comp
        ref={ref}
        data-slot={dataSlot}
        data-loading={isLoading ? "true" : undefined}
        data-variant={variant ?? "ghost"}
        data-size={size ?? undefined}
        aria-busy={isLoading ? "true" : undefined}
        className={cn(
          buttonVariants({ variant, size, className }),
          isLoading ? "ui-button-loading" : undefined
        )}
        disabled={disabled || isLoading}
        onPointerUp={handlePointerUp}
        onMouseUp={handleMouseUp}
        {...props}
      >
        {isLoading ? (
          isIconButton ? (
            <Spinner decorative className="text-current" size="sm" />
          ) : (
            <>
              <span
                className="ui-button-loading-placeholder"
                aria-hidden="true"
              >
                {children}
              </span>
              <span className="ui-button-loading-overlay">
                <Spinner decorative className="ui-button-loading-spinner" size="sm" />
                {derivedLoadingLabel ? (
                  <span className="ui-button-loading-label">
                    {derivedLoadingLabel}
                  </span>
                ) : null}
              </span>
            </>
          )
        ) : shouldWrapPrimitiveContent ? (
          <span className="ui-button-content">{children}</span>
        ) : (
          children
        )}
      </Comp>
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
