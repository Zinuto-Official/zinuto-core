// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import { WORKSPACE_READ_MODEL_REGISTRY } from '../application/workspaceReadModelService.js';
import { createWorkspaceReadModelController } from './workspaceController.js';

export const workspaceRouter = Router();

for (const entry of WORKSPACE_READ_MODEL_REGISTRY) {
  workspaceRouter.get(entry.path, createWorkspaceReadModelController(entry));
}
