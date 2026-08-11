// SPDX-License-Identifier: GPL-3.0-only

import type { Request, Response } from 'express';
import { appError } from '../kernel/appError.js';
import {
  archiveTrainingProjectFromSession,
  clearTrainingProjects,
  deleteTrainingProject,
  deleteTrainingProjects,
  getTrainingProjectById,
  listTrainingProjects,
  previewTrainingProjectSettlementFromSession,
  renameTrainingProject,
} from '../application/historyService.js';
import {
  getTrainingStatsReport,
  getTrainingStatsSummary,
} from '../application/trainingStatsService.js';
import { getReplayReviewConsoleBundle } from '../application/replayReviewConsoleService.js';
import {
  trainingProjectArchiveSessionSchema,
  trainingProjectRenameSchema,
  trainingProjectSettlementPreviewSchema,
  trainingProjectsDeleteSchema,
  trainingProjectsQuerySchema,
  trainingReviewDiagnosticsSchema,
  trainingStatsQuerySchema,
} from './apiSchemas.js';
import { ok } from './response.js';
import { parseRouteId } from './routeParams.js';

export const listTrainingProjectsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const query = trainingProjectsQuerySchema.parse(req.query ?? {});
  res.json(ok(await listTrainingProjects(query.limit, query.cursor)));
};

export const getTrainingProjectController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const item = await getTrainingProjectById(parseRouteId(req.params.id));
  if (!item) {
    throw appError('TRAINING_PROJECT_NOT_FOUND');
  }
  res.json(ok(item));
};

export const getTrainingStatsController = (
  req: Request,
  res: Response,
): void => {
  const query = trainingStatsQuerySchema.parse(req.query ?? {});
  res.json(ok(getTrainingStatsReport(query)));
};

export const getTrainingStatsSummaryController = (
  req: Request,
  res: Response,
): void => {
  const query = trainingStatsQuerySchema.parse(req.query ?? {});
  res.json(ok(getTrainingStatsSummary(query)));
};

export const getReplayReviewConsoleBundleController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = trainingReviewDiagnosticsSchema.parse(req.body ?? {});
  res.json(ok(await getReplayReviewConsoleBundle(payload)));
};

export const archiveTrainingProjectFromSessionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = trainingProjectArchiveSessionSchema.parse(req.body);
  res.json(ok(await archiveTrainingProjectFromSession(payload)));
};

export const previewTrainingProjectSettlementFromSessionController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = trainingProjectSettlementPreviewSchema.parse(req.body);
  res.json(ok(await previewTrainingProjectSettlementFromSession(payload)));
};

export const renameTrainingProjectController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const projectId = parseRouteId(req.params.id);
  const payload = trainingProjectRenameSchema.parse(req.body);
  res.json(ok(await renameTrainingProject(projectId, payload.name)));
};

export const deleteTrainingProjectController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await deleteTrainingProject(parseRouteId(req.params.id))));
};

export const deleteTrainingProjectsController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const payload = trainingProjectsDeleteSchema.parse(req.body ?? {});
  res.json(ok(await deleteTrainingProjects(payload.ids ?? [])));
};

export const clearTrainingProjectsController = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.json(ok(await clearTrainingProjects()));
};
