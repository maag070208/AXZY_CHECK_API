import { Router } from "express";

import indexRoute from "./index.routes";
import userRoute from "./users/user.routes";
import locationsRoute from "./locations/locations.routes";
import entriesRoute from "./entries/entries.routes";
import movementsRoute from "./movements/movements.routes";
import exitsRoute from "./exits/exits.routes";
import uploadRoute from "./common/upload.routes";
import keyAssignmentsRoute from "./key-assignments/key-assignments.routes";
import extraCostsRoute from "./extra-costs/extra-costs.routes";

const apiRouter = Router();

apiRouter.use("/", indexRoute);
apiRouter.use("/users", userRoute);
apiRouter.use("/locations", locationsRoute);
apiRouter.use("/entries", entriesRoute);
apiRouter.use("/movements", movementsRoute);
apiRouter.use("/exits", exitsRoute);
apiRouter.use("/uploads", uploadRoute);
apiRouter.use("/key-assignments", keyAssignmentsRoute);
apiRouter.use("/extra-costs", extraCostsRoute);

export default apiRouter;
