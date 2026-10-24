import { Router } from 'express';
import * as roundController from './round.controller';
import { authenticate } from '../common/middlewares/auth.middleware';
import { validate } from "@src/core/validation/validate";
import { endRoundBody, startRoundBody } from "./round.schemas";
import { idParam } from "@src/core/validation/common";
import { requirePermission } from "@src/modules/common/middlewares/require-permission.middleware";

const router = Router();

router.use(authenticate);

router.post('/start', requirePermission("round.start"), validate({ body: startRoundBody }), roundController.startRound);
router.put('/:id/end', requirePermission("round.end"), validate({ params: idParam, body: endRoundBody }), roundController.endRound);
router.get('/current', requirePermission("round.view"), roundController.getCurrentRound);
// Web Endpoints
router.post('/datatable', requirePermission("round.view"), roundController.getDataTable);
router.get('/', requirePermission("round.view"), roundController.getRounds);
router.get('/:id', requirePermission("round.view"), validate({ params: idParam }), roundController.getRoundDetail);

export default router;
