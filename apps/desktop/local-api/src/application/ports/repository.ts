// SPDX-License-Identifier: GPL-3.0-only

export type UnitOfWorkPort = {
  transaction<TValue>(runner: () => TValue): TValue;
};
