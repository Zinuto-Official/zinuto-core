// SPDX-License-Identifier: GPL-3.0-only

import * as React from "react";
import {
  autoUpdate,
  computePosition,
  flip,
  offset as floatingOffset,
  shift,
  type Placement,
} from "@floating-ui/dom";
import { createPortal } from "react-dom";

import { cn } from "@/ui/cn";
import {
  uiAnchoredFloatMotionClassName,
  uiFloatingSurfaceClassName,
} from "@/ui/primitives/ui-system";
import {
  type AppPortalContainer,
  useAppPortalContainer,
} from "@/ui/primitives/portalContainer";

type TooltipSide = "top" | "right" | "bottom" | "left";
type TooltipAlign = "start" | "center" | "end";
type TooltipOpenReason = "pointer" | "focus";

type TooltipContextValue = {
  close: () => void;
  contentId: string;
  isOpen: boolean;
  open: (reason: TooltipOpenReason) => void;
  registerTrigger: (node: HTMLElement | null) => void;
  triggerRef: React.MutableRefObject<HTMLElement | null>;
};

const TooltipContext = React.createContext<TooltipContextValue | null>(null);

const useTooltipContext = (componentName: string): TooltipContextValue => {
  const context = React.useContext(TooltipContext);
  if (!context) {
    throw new Error(`${componentName} must be used within Tooltip.`);
  }
  return context;
};

type TooltipProps = {
  children: React.ReactNode;
  delay?: number;
  delayDuration?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const callRef = <T,>(ref: React.Ref<T> | undefined, value: T | null): void => {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
};

const useStableMergedRefs = <T,>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> => {
  const refsRef = React.useRef(refs);
  React.useLayoutEffect(() => {
    refsRef.current = refs;
  });
  return React.useCallback((node) => {
    refsRef.current.forEach((ref) => callRef(ref, node));
  }, []);
};

const composeEventHandlers =
  <EventType extends React.SyntheticEvent>(
    childHandler: ((event: EventType) => void) | undefined,
    slotHandler: (event: EventType) => void,
  ) =>
  (event: EventType) => {
    childHandler?.(event);
    if (!event.defaultPrevented) {
      slotHandler(event);
    }
  };

function Tooltip({
  children,
  delay = 0,
  delayDuration,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: TooltipProps) {
  const resolvedDelay = delayDuration ?? delay;
  const contentId = React.useId();
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const openTimerRef = React.useRef<number | null>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = typeof controlledOpen === "boolean";
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const isOpenRef = React.useRef(isOpen);
  isOpenRef.current = isOpen;

  const clearOpenTimer = React.useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const setOpenState = React.useCallback(
    (nextOpen: boolean) => {
      if (isOpenRef.current === nextOpen) {
        return;
      }
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  const openTooltip = React.useCallback(
    (reason: TooltipOpenReason) => {
      clearOpenTimer();
      if (reason !== "pointer" || resolvedDelay <= 0) {
        setOpenState(true);
        return;
      }
      openTimerRef.current = window.setTimeout(() => {
        openTimerRef.current = null;
        setOpenState(true);
      }, resolvedDelay);
    },
    [clearOpenTimer, resolvedDelay, setOpenState],
  );

  const closeTooltip = React.useCallback(() => {
    clearOpenTimer();
    setOpenState(false);
  }, [clearOpenTimer, setOpenState]);

  React.useEffect(() => {
    const handleWindowBlur = () => closeTooltip();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        closeTooltip();
      }
    };
    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [closeTooltip]);

  const registerTrigger = React.useCallback((node: HTMLElement | null) => {
    if (triggerRef.current === node) {
      return;
    }
    triggerRef.current = node;
  }, []);

  React.useEffect(() => {
    return () => {
      clearOpenTimer();
    };
  }, [clearOpenTimer]);

  const contextValue = React.useMemo<TooltipContextValue>(
    () => ({
      close: closeTooltip,
      contentId,
      isOpen,
      open: openTooltip,
      registerTrigger,
      triggerRef,
    }),
    [
      closeTooltip,
      contentId,
      isOpen,
      openTooltip,
      registerTrigger,
    ],
  );

  return (
    <TooltipContext.Provider value={contextValue}>
      {children}
    </TooltipContext.Provider>
  );
}

type TooltipTriggerOwnProps = {
  asChild?: boolean;
};

type TooltipTriggerProps = TooltipTriggerOwnProps &
  React.ButtonHTMLAttributes<HTMLButtonElement>;

type TooltipTriggerChildProps = React.HTMLAttributes<HTMLElement> & {
  [key: string]: unknown;
  ref?: React.Ref<HTMLElement>;
};

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  (
    {
      asChild = false,
      children,
      onBlur,
      onClick,
      onFocus,
      onPointerEnter,
      onPointerLeave,
      ...props
    },
    forwardedRef,
  ) => {
    const context = useTooltipContext("TooltipTrigger");
    const triggerRef = useStableMergedRefs<HTMLElement>(
      forwardedRef as React.Ref<HTMLElement>,
      context.registerTrigger,
    );
    const child = asChild ? React.Children.only(children) : null;
    const isValidChild = React.isValidElement(child);
    const childProps = isValidChild
      ? (child.props as TooltipTriggerChildProps)
      : null;
    const childRef =
      childProps?.ref ??
      (isValidChild
        ? (child as { ref?: React.Ref<HTMLElement> }).ref
        : undefined);
    const mergedChildRef = useStableMergedRefs<HTMLElement>(
      childRef,
      triggerRef,
    );
    const triggerProps = {
      "aria-describedby": context.isOpen ? context.contentId : undefined,
      "data-slot": "tooltip-trigger",
      "data-state": context.isOpen ? "open" : "closed",
      onBlur: composeEventHandlers(
        onBlur as ((event: React.FocusEvent<HTMLElement>) => void) | undefined,
        context.close,
      ),
      onClick: composeEventHandlers(
        onClick as ((event: React.MouseEvent<HTMLElement>) => void) | undefined,
        context.close,
      ),
      onFocus: composeEventHandlers(
        onFocus as ((event: React.FocusEvent<HTMLElement>) => void) | undefined,
        () => context.open("focus"),
      ),
      onPointerEnter: composeEventHandlers(
        onPointerEnter as
          | ((event: React.PointerEvent<HTMLElement>) => void)
          | undefined,
        () => context.open("pointer"),
      ),
      onPointerLeave: composeEventHandlers(
        onPointerLeave as
          | ((event: React.PointerEvent<HTMLElement>) => void)
          | undefined,
        context.close,
      ),
      ref: triggerRef,
    };

    if (asChild) {
      if (!isValidChild || !childProps) {
        return null;
      }
      const clonedProps = {
        ...props,
        ...triggerProps,
        ...childProps,
        "aria-describedby": triggerProps["aria-describedby"],
        "data-slot": triggerProps["data-slot"],
        "data-state": triggerProps["data-state"],
        className: cn(props.className, childProps.className),
        onBlur: composeEventHandlers(childProps.onBlur, triggerProps.onBlur),
        onClick: composeEventHandlers(childProps.onClick, triggerProps.onClick),
        onFocus: composeEventHandlers(childProps.onFocus, triggerProps.onFocus),
        onPointerEnter: composeEventHandlers(
          childProps.onPointerEnter,
          triggerProps.onPointerEnter,
        ),
        onPointerLeave: composeEventHandlers(
          childProps.onPointerLeave,
          triggerProps.onPointerLeave,
        ),
        ref: mergedChildRef,
        style: {
          ...props.style,
          ...childProps.style,
        },
      } as Partial<TooltipTriggerChildProps> & React.Attributes & {
        "data-slot": string;
        "data-state": string;
        ref: React.Ref<HTMLElement>;
      };
      return React.cloneElement(
        child as React.ReactElement<TooltipTriggerChildProps>,
        clonedProps,
      );
    }

    return (
      <button
        type="button"
        {...props}
        {...triggerProps}
        ref={triggerRef as React.Ref<HTMLButtonElement>}
      >
        {children}
      </button>
    );
  },
);
TooltipTrigger.displayName = "TooltipTrigger";

type TooltipContentProps = React.HTMLAttributes<HTMLDivElement> & {
  side?: TooltipSide;
  sideOffset?: number;
  align?: TooltipAlign;
  alignOffset?: number;
  collisionPadding?: number;
  showArrow?: boolean;
  container?: AppPortalContainer | null;
};

type TooltipPositionState = {
  isPositioned: boolean;
  left: number;
  side: TooltipSide;
  top: number;
};

const buildHiddenTooltipPositionState = (
  side: TooltipSide,
): TooltipPositionState => ({
  isPositioned: false,
  left: 0,
  side,
  top: 0,
});

const resolveFloatingPlacement = (
  side: TooltipSide,
  align: TooltipAlign,
): Placement =>
  (align === "center" ? side : `${side}-${align}`) as Placement;

const resolveTooltipSide = (placement: Placement): TooltipSide =>
  placement.split("-")[0] as TooltipSide;

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  (
    {
      className,
      side = "top",
      sideOffset = 6,
      align = "center",
      alignOffset = 0,
      collisionPadding = 8,
      showArrow = false,
      container,
      children,
      style,
      onPointerEnter,
      onPointerLeave,
      ...props
    },
    forwardedRef,
  ) => {
    const context = useTooltipContext("TooltipContent");
    const resolvedContainer = useAppPortalContainer(container);
    const contentRef = React.useRef<HTMLDivElement | null>(null);
    const mergedContentRef = useStableMergedRefs<HTMLDivElement>(
      forwardedRef,
      contentRef,
    );
    const positionRequestVersionRef = React.useRef(0);
    const [positionState, setPositionState] =
      React.useState<TooltipPositionState>(() =>
        buildHiddenTooltipPositionState(side),
      );

    const { close, contentId, isOpen, triggerRef } = context;

    const updatePosition = React.useCallback(() => {
      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger || !content) {
        return;
      }

      const requestVersion = positionRequestVersionRef.current + 1;
      positionRequestVersionRef.current = requestVersion;
      void computePosition(trigger, content, {
        middleware: [
          floatingOffset({
            alignmentAxis: align === "center" ? null : alignOffset,
            crossAxis: alignOffset,
            mainAxis: sideOffset,
          }),
          flip({ padding: collisionPadding }),
          shift({ padding: collisionPadding }),
        ],
        placement: resolveFloatingPlacement(side, align),
        strategy: "fixed",
      })
        .then(({ x, y, placement }) => {
          if (
            positionRequestVersionRef.current !== requestVersion ||
            triggerRef.current !== trigger ||
            contentRef.current !== content
          ) {
            return;
          }
          setPositionState({
            isPositioned: true,
            left: x,
            side: resolveTooltipSide(placement),
            top: y,
          });
        })
        .catch(() => {
          if (
            positionRequestVersionRef.current !== requestVersion ||
            contentRef.current !== content
          ) {
            return;
          }
          setPositionState(buildHiddenTooltipPositionState(side));
        });
    }, [align, alignOffset, collisionPadding, side, sideOffset, triggerRef]);

    React.useLayoutEffect(() => {
      positionRequestVersionRef.current += 1;
      setPositionState(buildHiddenTooltipPositionState(side));
      if (!isOpen || !resolvedContainer) {
        return;
      }

      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger || !content) {
        return;
      }

      const cleanup = autoUpdate(trigger, content, updatePosition);
      return () => {
        positionRequestVersionRef.current += 1;
        cleanup();
      };
    }, [isOpen, resolvedContainer, side, triggerRef, updatePosition]);

    const floatingPositionStyle = {
      left: `${positionState.left}px`,
      position: "fixed",
      top: `${positionState.top}px`,
      visibility: positionState.isPositioned ? "visible" : "hidden",
    } satisfies React.CSSProperties;

    if (!isOpen || !resolvedContainer) {
      return null;
    }

    return createPortal(
      <div
        id={contentId}
        role="tooltip"
        ref={mergedContentRef}
        data-align={align}
        data-side={positionState.side}
        data-slot="tooltip-content"
        data-state={positionState.isPositioned ? "open" : undefined}
        className={cn(
          `z-50 inline-flex w-fit max-w-xs origin-center items-center gap-1.5 px-3 py-1.5 text-r1 font-normal text-[color:var(--text)] has-data-[slot=kbd]:pr-1.5 ${uiFloatingSurfaceClassName}`,
          positionState.isPositioned && uiAnchoredFloatMotionClassName,
          className,
        )}
        style={{ ...style, ...floatingPositionStyle }}
        onPointerEnter={onPointerEnter}
        onPointerLeave={composeEventHandlers(onPointerLeave, close)}
        {...props}
      >
        {children}
        {showArrow ? (
          <span
            aria-hidden="true"
            className="z-50 size-2 rotate-45 bg-[color:var(--ui-tooltip-bg)]"
          />
        ) : null}
      </div>,
      resolvedContainer,
    );
  },
);
TooltipContent.displayName = "TooltipContent";

export { Tooltip, TooltipTrigger, TooltipContent };
