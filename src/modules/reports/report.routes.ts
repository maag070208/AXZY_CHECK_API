
import { Router } from 'express';
import * as ReportController from './report.controller';
import authenticate from '../../core/middlewares/token-validator.middleware';

const router = Router();

router.use(authenticate);

router.get('/guards/stats', ReportController.getGuardStats);
router.get('/guards/top-performance', ReportController.getTopPerformance);
router.get('/guards/distribution', ReportController.getActivityDistribution);
router.get('/guards/detail', ReportController.getGuardDetailedReport);
router.get('/guards/detail-breakdown/:id', ReportController.getGuardDetailBreakdown);
router.get('/guards/workload', ReportController.getWorkloadComparison);

export default router;
