// SPDX-License-Identifier: GPL-3.0-only

export type SpecialTrainingBankDeleteConfirmWindowPayload = {
  bankId: string;
  bankName: string;
};

export type SpecialTrainingBankDeleteConfirmActionPayload = {
  bankId: string;
};

export const isSpecialTrainingBankDeleteConfirmWindowPayload = (
  value: unknown,
): value is SpecialTrainingBankDeleteConfirmWindowPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const payload =
    value as Partial<SpecialTrainingBankDeleteConfirmWindowPayload>;
  return (
    typeof payload.bankId === "string" &&
    payload.bankId.trim().length > 0 &&
    typeof payload.bankName === "string"
  );
};

export const readSpecialTrainingBankDeleteConfirmActionPayload = (
  value: unknown,
): SpecialTrainingBankDeleteConfirmActionPayload | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const bankId = String(
    (value as Partial<SpecialTrainingBankDeleteConfirmActionPayload>).bankId ??
      "",
  ).trim();
  if (!bankId) {
    return null;
  }
  return { bankId };
};
