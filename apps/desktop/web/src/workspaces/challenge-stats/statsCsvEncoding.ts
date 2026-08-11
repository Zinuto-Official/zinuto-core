// SPDX-License-Identifier: GPL-3.0-only

const SPREADSHEET_FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/u;

export const encodeCsvCell = (cell: string | number): string => {
  const raw = String(cell ?? '');
  const textSafe =
    typeof cell === 'string' && SPREADSHEET_FORMULA_PREFIX.test(raw)
      ? `'${raw}`
      : raw;
  return `"${textSafe.replaceAll('"', '""')}"`;
};
