// SPDX-License-Identifier: GPL-3.0-only

import type { ThemeModeToken } from '@/ui/theme/visual/types';

export const resolveDomThemeMode = (): ThemeModeToken => {
  if (typeof document === 'undefined') {
    return 'light';
  }
  const root = document.documentElement;
  if (root.classList.contains('theme-dark') || root.getAttribute('data-theme') === 'dark') {
    return 'dark';
  }
  const appRoot = document.querySelector('.app-root');
  if (appRoot?.classList.contains('theme-dark')) {
    return 'dark';
  }
  return 'light';
};
