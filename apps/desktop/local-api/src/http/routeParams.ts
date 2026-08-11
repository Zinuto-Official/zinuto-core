// SPDX-License-Identifier: GPL-3.0-only

import { z } from 'zod';
import { INPUT_LIMITS } from '@zinuto/shared/input-limits';

const idSchema = z.string().trim().min(1).max(INPUT_LIMITS.idChars);
const symbolSchema = z.string().trim().min(1).max(INPUT_LIMITS.symbolChars);

export const parseRouteId = (value: unknown): string => idSchema.parse(value);

export const parseRouteSymbol = (value: unknown): string => symbolSchema.parse(value);
