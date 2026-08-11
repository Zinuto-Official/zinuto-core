// SPDX-License-Identifier: GPL-3.0-only

import { db } from '../ports/infrastructure/db/database.js';
import { nowIso } from '../../kernel/time.js';
import { createTradingCoreStore } from '../ports/infrastructure/db/trading/coreStore.js';

export const tradingCoreStore = createTradingCoreStore({ db, nowIso });
