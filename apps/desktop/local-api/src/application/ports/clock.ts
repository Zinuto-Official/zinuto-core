// SPDX-License-Identifier: GPL-3.0-only

export type ClockPort = {
  now(): Date;
  nowIso(): string;
};
