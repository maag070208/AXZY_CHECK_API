import { Router } from 'express';
import * as ReportController from './report.controller';
import { authenticate } from '../common/middlewares/auth.middleware';
import incidentReportRouter from './incident-report.routes';
import { requirePermission } from '../common/middlewares/require-permission.middleware';
import { validate } from '@src/core/validation/validate';
import { idParam } from '@src/core/validation/common';
import { guardReportQuery } from './report.schemas';

const router = Router();

router.use(authenticate);

router.use(incidentReportRouter);

// Desempeño comparado del personal: solo quien supervisa (ADMIN y SHIFT).
const SUPERVISION = requirePermission('dashboard.view');
const withDates = validate({ query: guardReportQuery });

router.get('/guards/stats', SUPERVISION, withDates, ReportController.getGuardStats);
router.get('/guards/top-performance', SUPERVISION, withDates, ReportController.getTopPerformance);
router.get('/guards/distribution', SUPERVISION, withDates, ReportController.getActivityDistribution);
router.get('/guards/detail', SUPERVISION, withDates, ReportController.getGuardDetailedReport);
router.get('/guards/detail-breakdown/:id', SUPERVISION, validate({ params: idParam, query: guardReportQuery }), ReportController.getGuardDetailBreakdown);
router.get('/guards/workload', SUPERVISION, withDates, ReportController.getWorkloadComparison);

export default router;
