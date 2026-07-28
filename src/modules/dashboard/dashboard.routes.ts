import { Router } from 'express';
import * as DashboardController from './dashboard.controller';
import authenticate from '../../core/middlewares/token-validator.middleware';

const router = Router();

router.use(authenticate);

router.get('/', DashboardController.getDashboard);
router.get('/completed-rounds-today', DashboardController.getCompletedRoundsToday);

export default router;
