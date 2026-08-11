// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import {
  deleteCustomIndicatorProfile,
  listCustomIndicatorProfiles,
  replaceCustomIndicatorProfiles,
  saveCustomIndicatorProfile,
} from '../application/customIndicatorService.js';
import {
  compileCustomIndicatorScript,
  executeCustomIndicatorScript,
  type CompileCustomIndicatorScriptRequest,
  type ExecuteCustomIndicatorScriptRequest,
} from '../application/customIndicatorRuntimeService.js';
import {
  compileCustomIndicatorScriptSchema,
  deleteCustomIndicatorProfileSchema,
  executeCustomIndicatorScriptSchema,
  replaceCustomIndicatorProfilesSchema,
  saveCustomIndicatorProfileSchema,
} from './apiSchemas.js';
import { ok } from './response.js';

export const customIndicatorRouter = Router();

customIndicatorRouter.get('/custom-indicators/profiles', async (_req, res) => {
  res.json(ok(await listCustomIndicatorProfiles()));
});

customIndicatorRouter.put('/custom-indicators/profiles', async (req, res) => {
  const payload = replaceCustomIndicatorProfilesSchema.parse(req.body ?? {});
  res.json(ok(await replaceCustomIndicatorProfiles(payload.profiles)));
});

customIndicatorRouter.post('/custom-indicators/profiles/save', async (req, res) => {
  const payload = saveCustomIndicatorProfileSchema.parse(req.body ?? {});
  res.json(ok(await saveCustomIndicatorProfile(payload)));
});

customIndicatorRouter.post('/custom-indicators/profiles/delete', async (req, res) => {
  const payload = deleteCustomIndicatorProfileSchema.parse(req.body ?? {});
  res.json(ok(await deleteCustomIndicatorProfile(payload.profileId)));
});

customIndicatorRouter.post('/custom-indicators/compile', async (req, res) => {
  const payload = compileCustomIndicatorScriptSchema.parse(
    req.body ?? {},
  ) as CompileCustomIndicatorScriptRequest;
  res.json(ok(compileCustomIndicatorScript(payload)));
});

customIndicatorRouter.post('/custom-indicators/execute', async (req, res) => {
  const payload = executeCustomIndicatorScriptSchema.parse(
    req.body ?? {},
  ) as ExecuteCustomIndicatorScriptRequest;
  res.json(ok(executeCustomIndicatorScript(payload)));
});
