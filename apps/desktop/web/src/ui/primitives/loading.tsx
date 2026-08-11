// SPDX-License-Identifier: GPL-3.0-only

import type { ReactNode } from "react";
import { cn } from "@/ui/cn";
import { tt } from "@/frontend-kernel/i18n/messageRuntime";

type SpinnerProps = {
  className?: string;
  decorative?: boolean;
  label?: ReactNode;
  size?: "xs" | "sm" | "md" | "lg";
};

const spinnerSizeClassName: Record<NonNullable<SpinnerProps["size"]>, string> = {
  xs: "ui-spinner-glyph-xs size-3",
  sm: "ui-spinner-glyph-sm size-3.5",
  md: "ui-spinner-glyph-md size-4",
  lg: "ui-spinner-glyph-lg size-5",
};

export const Spinner = ({
  className,
  decorative = false,
  label,
  size = "md",
}: SpinnerProps) => {
  const resolvedLabel = label ?? tt("appText.loading2");

  return (
    <span
      className={cn("ui-spinner inline-flex items-center justify-center", className)}
      data-size={size}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "status"}
    >
      <span
        className={cn(
          "ui-spinner-glyph rounded-full border-[1.8px] border-current/28 border-t-current animate-spin motion-reduce:animate-none",
          spinnerSizeClassName[size],
        )}
      />
      {decorative ? null : <span className="sr-only">{resolvedLabel}</span>}
    </span>
  );
};

type InlineLoadingStateProps = {
  className?: string;
  label: ReactNode;
  spinnerClassName?: string;
  spinnerSize?: SpinnerProps["size"];
};

export const InlineLoadingState = ({
  className,
  label,
  spinnerClassName,
  spinnerSize = "sm",
}: InlineLoadingStateProps) => (
  <div
    className={cn(
      "inline-flex items-center gap-2 text-r2 text-[color:var(--muted)]",
      className,
    )}
    role="status"
    aria-live="polite"
  >
    <Spinner
      className={spinnerClassName}
      decorative
      size={spinnerSize}
    />
    <span>{label}</span>
  </div>
);

type PageLoadingStateProps = {
  className?: string;
  description?: ReactNode;
  label: ReactNode;
  title?: ReactNode;
};

export const PageLoadingState = ({
  className,
  description,
  label,
  title,
}: PageLoadingStateProps) => (
  <section
    className={cn(
      "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-[color:var(--line)] bg-[color:var(--panel-soft)]/80 px-6 py-10 text-center shadow-[var(--shadow-soft)]",
      className,
    )}
    role="status"
    aria-live="polite"
  >
    <Spinner decorative size="lg" />
    {title ? (
      <strong className="text-r3 font-semibold text-[color:var(--text-strong)]">
        {title}
      </strong>
    ) : null}
    <span className="text-r2 text-[color:var(--text)]">{label}</span>
    {description ? (
      <p className="max-w-[34rem] text-r2 text-[color:var(--muted)]">
        {description}
      </p>
    ) : null}
  </section>
);
