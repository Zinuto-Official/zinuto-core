// SPDX-License-Identifier: GPL-3.0-only

import { SYSTEM_RESET_LIMITS } from '@zinuto/shared/input-limits';

export const RESET_JOB_POLL_DEADLINE_MS =
  SYSTEM_RESET_LIMITS.jobDeadlineMaxMs +
  SYSTEM_RESET_LIMITS.clientDeadlineGraceMs;
