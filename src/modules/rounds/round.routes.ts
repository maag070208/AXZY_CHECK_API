import { Router } from 'express';
import * as roundController from './round.controller';
import authenticate from '../../core/middlewares/token-validator.middleware';

const router = Router();

router.use(authenticate);

router.post('/start', roundController.startRound);
router.put('/:id/end', roundController.endRound);
router.get('/current', roundController.getCurrentRound);
// Web Endpoints
router.post('/datatable', roundController.getDataTable);
router.get('/', roundController.getRounds);
router.get('/:id', roundController.getRoundDetail);

export default router;
