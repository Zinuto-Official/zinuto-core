// SPDX-License-Identifier: GPL-3.0-only

import { useRef } from 'react';

const hasOwn = Object.prototype.hasOwnProperty;

const areObjectKeysEqual = (left: Record<string, unknown>, right: Record<string, unknown>): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!hasOwn.call(right, key) || !Object.is(left[key], right[key])) {
      return false;
    }
  }
  return true;
};

export const useShallowStableObject = <T extends Record<string, unknown>>(value: T): T => {
  const stableRef = useRef(value);
  if (!areObjectKeysEqual(stableRef.current, value)) {
    stableRef.current = value;
  }
  return stableRef.current;
};
