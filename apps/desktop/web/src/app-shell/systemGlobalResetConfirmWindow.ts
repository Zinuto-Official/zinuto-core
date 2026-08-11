// SPDX-License-Identifier: GPL-3.0-only

export type SystemGlobalResetConfirmWindowPayload = {
  totalUsageText: string;
  affectedPoolCount: number;
  affectedSymbolCount: number;
};

export const isSystemGlobalResetConfirmWindowPayload = (
  value: unknown,
): value is SystemGlobalResetConfirmWindowPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const payload = value as Partial<SystemGlobalResetConfirmWindowPayload>;
  return (
    typeof payload.totalUsageText === "string" &&
    Number.isFinite(Number(payload.affectedPoolCount)) &&
    Number.isFinite(Number(payload.affectedSymbolCount))
  );
};
