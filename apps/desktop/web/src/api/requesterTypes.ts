// SPDX-License-Identifier: GPL-3.0-only

export type ApiRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type ApiRequesterOptions = RequestInit & {
  timeoutMs?: number;
};

export type ApiRequester = <T>(
  path: string,
  init?: ApiRequesterOptions,
) => Promise<T>;
