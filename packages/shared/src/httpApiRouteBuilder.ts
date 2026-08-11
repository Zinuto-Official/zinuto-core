// SPDX-License-Identifier: GPL-3.0-only

type RouteParamValue = string | number | boolean;
type RouteQueryValue =
  | RouteParamValue
  | null
  | undefined
  | readonly (RouteParamValue | null | undefined)[];

export type HttpApiRouteParams = Readonly<Record<string, RouteParamValue>>;
export type HttpApiRouteQuery = Readonly<Record<string, RouteQueryValue>>;

const OPEN_API_PARAM_PATTERN = /\{([^}]+)\}/gu;

const normalizeRouteValue = (value: RouteParamValue): string =>
  encodeURIComponent(String(value));

export const buildHttpApiRoute = (
  routePath: string,
  params: HttpApiRouteParams = {},
  query?: HttpApiRouteQuery,
): string => {
  const usedParams = new Set<string>();
  const pathname = routePath.replace(OPEN_API_PARAM_PATTERN, (_match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      throw new Error(`Missing route parameter: ${key}`);
    }
    usedParams.add(key);
    return normalizeRouteValue(params[key]);
  });
  for (const key of Object.keys(params)) {
    if (!usedParams.has(key)) {
      throw new Error(`Unused route parameter: ${key}`);
    }
  }
  if (!query) {
    return pathname;
  }
  const search = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(query)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }
      search.append(key, String(value));
    }
  }
  const queryString = search.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
};

export const toExpressRoutePath = (routePath: string): string =>
  routePath.replace(OPEN_API_PARAM_PATTERN, (_match, key: string) => `:${key}`);
