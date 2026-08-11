// SPDX-License-Identifier: GPL-3.0-only

import {
  bootstrapMainDesktopViewport,
  subscribeDesktopViewportChanges,
  type DesktopViewportLayoutMode,
} from '@/api';
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { DESKTOP_MAIN_WINDOW_ZOOM_BASE } from '@/frontend-kernel/secondary-windows/desktopWindowViewportConfig';
import { commitThemeChangeWithTransition } from '@/ui/theme/themeTransition';

type UseAppViewportAndSystemThemeArgs = {
  setSystemThemeMode: Dispatch<SetStateAction<'dark' | 'light'>>;
  setViewportScale: Dispatch<SetStateAction<number>>;
  setViewportLayoutMode: Dispatch<SetStateAction<DesktopViewportLayoutMode>>;
};

export const useAppViewportAndSystemTheme = ({
  setSystemThemeMode,
  setViewportScale,
  setViewportLayoutMode
}: UseAppViewportAndSystemThemeArgs) => {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const resolveMode = (matches: boolean) => matches ? 'dark' : 'light';
    setSystemThemeMode(resolveMode(media.matches));
    const listener = (event: MediaQueryListEvent) =>
      commitThemeChangeWithTransition(() =>
        setSystemThemeMode(resolveMode(event.matches)),
      );
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
    media.addListener(listener);
    return () => media.removeListener(listener);
  }, [setSystemThemeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    let frameId = 0;
    let requestToken = 0;
    let disposed = false;
    let detachViewportChanges = () => {};
    const applyViewportState = () => {
      const currentRequestToken = ++requestToken;
      void (async () => {
        const viewport = await bootstrapMainDesktopViewport(
          DESKTOP_MAIN_WINDOW_ZOOM_BASE,
          { applyZoom: true },
        );
        if (disposed || currentRequestToken !== requestToken) {
          return;
        }
        setViewportScale((current) =>
          Math.abs(current - viewport.cssViewportScale) < 0.005
            ? current
            : viewport.cssViewportScale,
        );
        setViewportLayoutMode((current) =>
          current === viewport.layoutMode ? current : viewport.layoutMode,
        );
      })();
    };
    const handleViewportChange = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        applyViewportState();
      });
    };
    void subscribeDesktopViewportChanges(handleViewportChange).then((detach) => {
      if (disposed) {
        detach();
        return;
      }
      detachViewportChanges = detach;
    });
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      detachViewportChanges();
    };
  }, [setViewportLayoutMode, setViewportScale]);
};
