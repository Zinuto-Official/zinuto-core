// SPDX-License-Identifier: GPL-3.0-only

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/ui/cn';

type DrawingToolbarProps = {
  tools: ReactNode;
  controls?: ReactNode;
  actions?: ReactNode;
  note?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  surface?: "card" | "flush";
  density?: "default" | "compact" | "slim";
};

export const DrawingToolbar = ({
  tools,
  controls,
  actions,
  note,
  disabled = false,
  className,
  style,
  surface = "card",
  density = "default",
}: DrawingToolbarProps) => {
  return (
    <aside
      data-surface={surface}
      data-density={density}
      className={cn(
        "drawing-toolbar flex h-full shrink-0 flex-col",
        surface === "card"
          ? "rounded-card border border-subtle/60 bg-panel-soft"
          : "rounded-none border-0 bg-transparent",
        disabled ? 'is-disabled' : '',
        note ? 'has-note' : 'no-note',
        className
      )}
      aria-disabled={disabled}
      style={style}
    >
      <div className="draw-toolbar-section draw-toolbar-section-tools">{tools}</div>
      <div className="draw-toolbar-section draw-toolbar-section-config">{controls}</div>
      <div className="draw-toolbar-section draw-toolbar-section-actions">{actions}</div>
      {note ? (
        <div className="draw-toolbar-section draw-toolbar-section-note">{note}</div>
      ) : null}
    </aside>
  );
};
