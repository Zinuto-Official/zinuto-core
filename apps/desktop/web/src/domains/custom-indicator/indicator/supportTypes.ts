// SPDX-License-Identifier: GPL-3.0-only

export type FutuDataScopeBlockReason =
  | "REQUIRES_OPTIONS_CHAIN"
  | "REQUIRES_SESSION_CONTEXT"
  | "REQUIRES_EXCHANGE_LIMIT_RULES";

export type FutuCapabilitySupportState =
  | "full"
  | "blocked-data-scope"
  | "unsupported";
