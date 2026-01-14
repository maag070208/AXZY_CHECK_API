import { Router } from "express";

import indexRoute from "./index.routes";
import userRoute from "./users/user.routes";
import locationsRoute from "./locations/locations.routes";
import uploadRoute from "./common/upload.routes";
import kardexRoute from "./kardex/kardex.routes";
import assignmentsRoute from "./assignments/assignment.routes";


const apiRouter = Router();

apiRouter.use("/", indexRoute);
apiRouter.use("/users", userRoute);
apiRouter.use("/locations", locationsRoute);
apiRouter.use("/uploads", uploadRoute);
apiRouter.use("/kardex", kardexRoute);
apiRouter.use("/assignments", assignmentsRoute);


export default apiRouter;
