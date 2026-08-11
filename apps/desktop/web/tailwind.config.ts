// SPDX-License-Identifier: GPL-3.0-only

import type { Config } from 'tailwindcss';

const withVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const typographyFontSize = {
  r1: ['var(--ty-r1)', { lineHeight: 'var(--ty-leading-caption)', letterSpacing: 'var(--ty-tracking-caption)' }],
  r2: ['var(--ty-r2)', { lineHeight: 'var(--ty-leading-label)', letterSpacing: 'var(--ty-tracking-label)' }],
  r3: ['var(--ty-r3)', { lineHeight: 'var(--ty-leading-body)', letterSpacing: 'var(--ty-tracking-body)' }],
  r4: ['var(--ty-r4)', { lineHeight: 'var(--ty-leading-title)', letterSpacing: 'var(--ty-tracking-title)' }],
  r5: ['var(--ty-r5)', { lineHeight: 'var(--ty-leading-title)', letterSpacing: 'var(--ty-tracking-title)' }],
  r6: ['var(--ty-r6)', { lineHeight: 'var(--ty-leading-display)', letterSpacing: 'var(--ty-tracking-display)' }],
  r7: ['var(--ty-r7)', { lineHeight: 'var(--ty-leading-display)', letterSpacing: 'var(--ty-tracking-display)' }],
  r8: ['var(--ty-r8)', { lineHeight: 'var(--ty-leading-display)', letterSpacing: 'var(--ty-tracking-display)' }]
} as const;

export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./*.html', './src/**/*.{ts,tsx}'],
  theme: {
    fontSize: typographyFontSize,
    extend: {
      colors: {
        background: withVar('--color-window-bg'),
        foreground: withVar('--color-text-primary'),
        border: withVar('--color-card-border'),
        input: withVar('--color-input-border'),
        ring: withVar('--color-focus-ring'),
        popover: withVar('--color-panel-bg'),
        'popover-foreground': withVar('--color-text-primary'),
        muted: withVar('--color-panel-soft-bg'),
        'muted-foreground': withVar('--color-text-tertiary'),
        accent: withVar('--color-selected-bg'),
        'accent-foreground': withVar('--color-text-primary'),
        destructive: withVar('--color-danger'),
        'destructive-foreground': withVar('--color-text-inverse'),
        secondary: withVar('--color-panel-soft-bg'),
        'secondary-foreground': withVar('--color-text-primary'),
        'primary-foreground': withVar('--color-text-inverse'),
        'card-foreground': withVar('--color-text-primary'),
        app: {
          bg: withVar('--color-app-bg')
        },
        window: {
          bg: withVar('--color-window-bg'),
          toolbar: withVar('--color-window-toolbar-bg')
        },
        panel: withVar('--color-panel-bg'),
        'panel-soft': withVar('--color-panel-soft-bg'),
        card: withVar('--color-card-bg'),
        elevated: withVar('--color-elevated-bg'),
        'card-border': withVar('--color-card-border'),
        subtle: withVar('--color-subtle-border'),
        primary: withVar('--color-primary'),
        success: withVar('--color-success'),
        danger: withVar('--color-danger'),
        warning: withVar('--color-warning'),
        info: withVar('--color-info'),
        focus: withVar('--color-focus-ring'),
        'selected': withVar('--color-selected-bg'),
        'hover-bg': withVar('--color-hover-bg'),
        'pressed-bg': withVar('--color-pressed-bg'),
        'input-bg': withVar('--color-input-bg'),
        'input-border': withVar('--color-input-border'),
        'overlay-backdrop': withVar('--color-overlay-backdrop'),
        text: {
          primary: withVar('--color-text-primary'),
          secondary: withVar('--color-text-secondary'),
          tertiary: withVar('--color-text-tertiary'),
          muted: withVar('--color-text-muted')
        },
        chart: {
          grid: withVar('--color-chart-grid'),
          axis: withVar('--color-chart-axis'),
          tooltip: withVar('--color-chart-tooltip-bg')
        }
      },
      borderRadius: {
        card: 'var(--ui-radius-surface)',
        'card-lg': 'var(--ui-radius-floating)',
        'card-sm': 'calc(var(--ui-radius-surface) - 2px)',
        control: 'var(--ui-radius-control)',
        pill: 'var(--ui-radius-pill)'
      },
      spacing: {
        'page-x': 'var(--space-page-x)',
        'page-y': 'var(--space-page-y)',
        card: 'var(--space-card)',
        section: 'var(--space-section)',
        list: 'var(--space-list)'
      },
      height: {
        toolbar: 'var(--size-toolbar-h)',
        input: 'var(--ui-size-control-default)',
        'btn-sm': 'var(--ui-size-control-compact)',
        'btn-md': 'var(--ui-size-control-default)',
        'btn-lg': 'var(--ui-size-control-large)'
      },
      maxWidth: {
        page: 'var(--size-page-max)'
      },
      boxShadow: {
        soft: 'var(--shadow-soft)',
        float: 'var(--shadow-float)',
        emboss: 'var(--shadow-emboss)'
      }
    }
  },
  plugins: []
} satisfies Config;
