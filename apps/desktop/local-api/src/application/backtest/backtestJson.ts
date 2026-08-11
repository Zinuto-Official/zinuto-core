// SPDX-License-Identifier: GPL-3.0-only

export const stringifyBacktestJson = (value: unknown): string =>
  JSON.stringify(value ?? {});

export const parseBacktestJsonRecord = (
  value: string | null | undefined,
): Record<string, unknown> => {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};
