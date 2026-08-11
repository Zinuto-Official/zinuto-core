// SPDX-License-Identifier: GPL-3.0-only

import { createContext, useContext, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { FALLBACK_THEME, THEME_ATTRIBUTE, type ResolvedTheme, type ThemeMode } from '@/ui/theme/themeTokens';

type ThemeProviderProps = {
  mode?: ThemeMode;
  resolvedMode?: ResolvedTheme;
  children: ReactNode;
};

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedMode: ResolvedTheme;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: FALLBACK_THEME,
  resolvedMode: 'light'
});

const setDocumentTheme = (resolvedMode: ResolvedTheme) => {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.setAttribute(THEME_ATTRIBUTE, resolvedMode);
  root.dataset.zinutoInitialTheme = resolvedMode;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(`theme-${resolvedMode}`);
  root.style.colorScheme = resolvedMode;
};

export const ThemeProvider = ({ mode = FALLBACK_THEME, resolvedMode = 'light', children }: ThemeProviderProps) => {
  useLayoutEffect(() => {
    setDocumentTheme(resolvedMode);
  }, [resolvedMode]);

  const value = useMemo(
    () => ({
      mode,
      resolvedMode
    }),
    [mode, resolvedMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => useContext(ThemeContext);
