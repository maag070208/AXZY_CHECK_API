import { Router } from 'express';
import * as roundController from './round.controller';
import { authenticate } from '../common/middlewares/auth.middleware';
import { validate } from "@src/core/validation/validate";
import { endRoundBody, startRoundBody } from "./round.schemas";
import { idParam } from "@src/core/validation/common";

const router = Router();

router.use(authenticate);

router.post('/start', validate({ body: startRoundBody }), roundController.startRound);
router.put('/:id/end', validate({ params: idParam, body: endRoundBody }), roundController.endRound);
router.get('/current', roundController.getCurrentRound);
// Web Endpoints
router.post('/datatable', roundController.getDataTable);
router.get('/', roundController.getRounds);
router.get('/:id', validate({ params: idParam }), roundController.getRoundDetail);

export default router;
