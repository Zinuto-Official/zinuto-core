// SPDX-License-Identifier: GPL-3.0-only

import { Router } from 'express';
import { backtestRouter } from './backtestRoutes.js';
import { customIndicatorRouter } from './customIndicatorRoutes.js';
import { dataSourceRouter } from './dataSourceRoutes.js';
import { marketDataAcquisitionRouter } from './marketDataAcquisitionRoutes.js';
import { replayNoteRouter } from './replayNoteRoutes.js';
import { sessionRouter } from './sessionRoutes.js';
import { systemRouter } from './systemRoutes.js';
import { trainingRouter } from './trainingRoutes.js';
import { workspaceRouter } from './workspaceRoutes.js';

const router = Router();

router.use(systemRouter);
router.use(workspaceRouter);
router.use(sessionRouter);
router.use(trainingRouter);
router.use(dataSourceRouter);
router.use(marketDataAcquisitionRouter);
router.use(replayNoteRouter);
router.use(customIndicatorRouter);
router.use(backtestRouter);

export { router as baseApiRouter };
