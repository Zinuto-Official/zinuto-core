// SPDX-License-Identifier: GPL-3.0-only

import type { DataTaskOperationProgress } from "@/domains/data-import/dataSourceTypes";
import React, { type ReactNode } from "react";

const formatProgressPercent = (value: number): string =>
  `${Math.max(0, Math.min(100, Math.round(value)))}%`;

export const DataTaskProgressRail = ({
  progress,
}: {
  progress: DataTaskOperationProgress;
}) => {
  const hasPercent =
    progress.progressPercent !== null &&
    Number.isFinite(progress.progressPercent);
  const normalizedProgressPercent = hasPercent
    ? Math.max(0, Math.min(100, Number(progress.progressPercent) || 0))
    : null;
  return (
    <div
      className={`data-task-progress-rail is-${progress.tone} ${
        hasPercent ? "is-determinate" : "is-indeterminate"
      }`.trim()}
      aria-live="polite"
    >
      <div className="data-task-progress-rail-head">
        <span className="data-task-progress-rail-label">
          {progress.label}
        </span>
        {normalizedProgressPercent !== null ? (
          <span className="data-task-progress-rail-value">
            {formatProgressPercent(normalizedProgressPercent)}
          </span>
        ) : null}
      </div>
      <div className="data-task-progress-rail-track">
        <span
          style={
            normalizedProgressPercent !== null
              ? { width: `${normalizedProgressPercent}%` }
              : undefined
          }
        />
      </div>
    </div>
  );
};

export const createIndeterminateProgress = (
  label: string,
): DataTaskOperationProgress => ({
  label,
  progressPercent: null,
  active: true,
  tone: "checking",
});

type DataConfigDetailContentBoundaryProps = {
  resetKey: string;
  fallbackMessage: string;
  children: ReactNode;
};

type DataConfigDetailContentBoundaryState = {
  hasError: boolean;
};

export class DataConfigDetailContentBoundary extends React.Component<
  DataConfigDetailContentBoundaryProps,
  DataConfigDetailContentBoundaryState
> {
  state: DataConfigDetailContentBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): DataConfigDetailContentBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[data-config-detail-window] render failed", error);
  }

  componentDidUpdate(
    prevProps: DataConfigDetailContentBoundaryProps,
    prevState: DataConfigDetailContentBoundaryState,
  ) {
    if (
      prevState.hasError &&
      prevProps.resetKey !== this.props.resetKey &&
      this.state.hasError
    ) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="data-config-detail-window-error">
          {this.props.fallbackMessage}
        </div>
      );
    }
    return this.props.children;
  }
}
