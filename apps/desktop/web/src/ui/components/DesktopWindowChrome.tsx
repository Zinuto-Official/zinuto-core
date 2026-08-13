// SPDX-License-Identifier: GPL-3.0-only

import {
  useEffect,
  useState,
  type MouseEventHandler,
} from "react";
import {
  closeCurrentDesktopWindow,
  minimizeCurrentDesktopWindow,
  shouldUseCustomDesktopWindowChrome,
  subscribeCurrentDesktopWindowMaximized,
  syncCurrentDesktopWindowTheme,
  toggleCurrentDesktopWindowMaximized,
  type DesktopWindowTheme,
} from "@/api";
import { useWindowChromeDrag } from "@/app-shell/useWindowChromeDrag";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";
import { AppIcon } from "@/assets/graphics";
import { Button } from "@/ui/primitives/button";

type DesktopWindowChromeDragHandlers = {
  onMouseDownCapture: MouseEventHandler<HTMLDivElement>;
  onMouseMoveCapture: MouseEventHandler<HTMLDivElement>;
  onMouseUpCapture: MouseEventHandler<HTMLDivElement>;
  onMouseLeave: MouseEventHandler<HTMLDivElement>;
  onDoubleClickCapture: MouseEventHandler<HTMLDivElement>;
};

export type DesktopWindowChromeProps = {
  dragHandlers?: DesktopWindowChromeDragHandlers;
  logoAlt: string;
  logoSrc: string;
  theme: DesktopWindowTheme;
  title: string;
  variant: "main" | "secondary";
};

export const DesktopWindowChrome = ({
  dragHandlers,
  logoAlt,
  logoSrc,
  theme,
  title,
  variant,
}: DesktopWindowChromeProps) => {
  const fallbackDragHandlers = useWindowChromeDrag();
  const resolvedDragHandlers = dragHandlers ?? {
    onMouseDownCapture: fallbackDragHandlers.startWindowDrag,
    onMouseMoveCapture: fallbackDragHandlers.continueWindowDrag,
    onMouseUpCapture: fallbackDragHandlers.clearPendingWindowDrag,
    onMouseLeave: fallbackDragHandlers.clearPendingWindowDrag,
    onDoubleClickCapture: fallbackDragHandlers.toggleWindowMaximize,
  };
  const [maximized, setMaximized] = useState(false);
  const customChromeEnabled = shouldUseCustomDesktopWindowChrome();

  useEffect(() => {
    if (!customChromeEnabled) {
      return;
    }
    void syncCurrentDesktopWindowTheme(theme).catch(() => undefined);
  }, [customChromeEnabled, theme]);

  useEffect(() => {
    if (!customChromeEnabled) {
      return;
    }
    let disposed = false;
    let cleanup: () => void = () => undefined;
    void subscribeCurrentDesktopWindowMaximized(setMaximized)
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        cleanup = unlisten;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      cleanup();
    };
  }, [customChromeEnabled]);

  if (!customChromeEnabled) {
    return null;
  }

  const maximizeLabel = maximized
    ? tt("desktop.windowChrome.restore")
    : tt("desktop.windowChrome.maximize");

  return (
    <header
      className={`desktop-window-chrome is-${variant}`}
      data-zinuto-window-chrome-surface="true"
    >
      <div
        className="desktop-window-chrome-identity"
        data-window-chrome-drag="true"
        {...resolvedDragHandlers}
      >
        <img
          alt={logoAlt}
          className="desktop-window-chrome-logo"
          draggable={false}
          src={logoSrc}
        />
        <span className="desktop-window-chrome-title">{title}</span>
      </div>
      <div
        aria-hidden="true"
        className="desktop-window-chrome-drag-space"
        data-window-chrome-drag="true"
        {...resolvedDragHandlers}
      />
      <div className="desktop-window-chrome-controls">
        <Button
          aria-label={tt("desktop.windowChrome.minimize")}
          className="desktop-window-chrome-button"
          onClick={() => void minimizeCurrentDesktopWindow().catch(() => undefined)}
          title={tt("desktop.windowChrome.minimize")}
          type="button"
        >
          <AppIcon
            aria-hidden="true"
            className="desktop-window-chrome-control-icon"
            name="windowMinimize"
          />
        </Button>
        <Button
          aria-label={maximizeLabel}
          className="desktop-window-chrome-button"
          onClick={() =>
            void toggleCurrentDesktopWindowMaximized().catch(() => undefined)
          }
          title={maximizeLabel}
          type="button"
        >
          <AppIcon
            aria-hidden="true"
            className="desktop-window-chrome-control-icon"
            name={maximized ? "windowRestore" : "windowMaximize"}
          />
        </Button>
        <Button
          aria-label={tt("desktop.windowChrome.close")}
          className="desktop-window-chrome-button is-close"
          onClick={() => void closeCurrentDesktopWindow().catch(() => undefined)}
          title={tt("desktop.windowChrome.close")}
          type="button"
        >
          <AppIcon
            aria-hidden="true"
            className="desktop-window-chrome-control-icon"
            name="windowClose"
          />
        </Button>
      </div>
    </header>
  );
};
