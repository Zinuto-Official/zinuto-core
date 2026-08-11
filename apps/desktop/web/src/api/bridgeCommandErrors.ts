// SPDX-License-Identifier: GPL-3.0-only

export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

export const readTrimmedText = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const readBridgeCommandErrorCode = (error: unknown): string => {
  if (!error || typeof error !== "object") {
    return "";
  }
  const record = error as Record<string, unknown>;
  const directCode =
    readTrimmedText(record.errorCode) || readTrimmedText(record.code);
  if (directCode) {
    return directCode;
  }
  const errorRecord = record.error;
  if (!isPlainRecord(errorRecord)) {
    return "";
  }
  return readTrimmedText(errorRecord.errorCode) || readTrimmedText(errorRecord.code);
};

const toBridgeCommandErrorArgText = (value: unknown): string => {
  if (value === undefined || value === null) {
    return "";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : String(value);
  } catch {
    return String(value);
  }
};

const readPlainArgsRecord = (
  primary: unknown,
  legacy: unknown,
): Record<string, unknown> | undefined => {
  if (isPlainRecord(primary)) {
    return primary;
  }
  return isPlainRecord(legacy) ? legacy : undefined;
};

export const readBridgeCommandErrorArgs = (
  error: unknown,
): Record<string, string> | undefined => {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const record = error as Record<string, unknown>;
  const directArgs = readPlainArgsRecord(record.errorArgs, record.args);
  if (directArgs) {
    return Object.fromEntries(
      Object.entries(directArgs).map(([key, value]) => [
        key,
        toBridgeCommandErrorArgText(value),
      ]),
    );
  }
  const errorRecord = record.error;
  if (!isPlainRecord(errorRecord)) {
    return undefined;
  }
  const nestedArgs = readPlainArgsRecord(errorRecord.errorArgs, errorRecord.args);
  if (!nestedArgs) return undefined;
  return Object.fromEntries(
    Object.entries(nestedArgs).map(([key, value]) => [
      key,
      toBridgeCommandErrorArgText(value),
    ]),
  );
};
