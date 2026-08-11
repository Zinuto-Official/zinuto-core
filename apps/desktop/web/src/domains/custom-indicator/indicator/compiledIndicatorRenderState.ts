// SPDX-License-Identifier: GPL-3.0-only

import type { TooltipFeatureStyle } from 'klinecharts';

type CompiledIndicatorRenderIssueItem = {
  id: string;
  message: string;
  line?: number;
  column?: number;
};

let activeCompiledScriptState: unknown = null;
let activeCompiledScriptTooltipFeatures: TooltipFeatureStyle[] = [];
let lastRenderIssueSignature = '';
let renderIssueReporter: ((issues: CompiledIndicatorRenderIssueItem[]) => void) | null = null;

export const setActiveCompiledScriptState = (state: unknown): void => {
  activeCompiledScriptState = state;
};

export const clearActiveCompiledScriptState = (): void => {
  activeCompiledScriptState = null;
};

export const getActiveCompiledScriptState = <T>(): T | null => activeCompiledScriptState as T | null;

export const setActiveCompiledScriptTooltipFeatures = (
  features: TooltipFeatureStyle[],
): void => {
  activeCompiledScriptTooltipFeatures = [...features];
};

export const clearActiveCompiledScriptTooltipFeatures = (): void => {
  activeCompiledScriptTooltipFeatures = [];
};

export const getActiveCompiledScriptTooltipFeatures = (): TooltipFeatureStyle[] =>
  activeCompiledScriptTooltipFeatures;

export const setCompiledIndicatorRenderIssueReporter = (
  reporter: ((issues: CompiledIndicatorRenderIssueItem[]) => void) | null,
): void => {
  renderIssueReporter = reporter;
  if (!reporter) {
    lastRenderIssueSignature = '';
  }
};

export const reportCompiledIndicatorRenderIssues = (issues: CompiledIndicatorRenderIssueItem[]): void => {
  const signature = issues.map((item) => `${item.message}|${String(item.line ?? 0)}|${String(item.column ?? 0)}`).join('||');
  if (signature === lastRenderIssueSignature) {
    return;
  }
  lastRenderIssueSignature = signature;
  renderIssueReporter?.(issues);
};
