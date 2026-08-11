// SPDX-License-Identifier: GPL-3.0-only

import { randomUUID } from 'node:crypto';

export const createId = (): string => randomUUID();
