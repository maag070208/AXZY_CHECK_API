import { Router } from "express";

import indexRoute from "./index.routes";
import userRoute from "./users/user.routes";
import trainingModeRoute from "./trainingMode/trainingMode.controller";
import dayScheduleRoute from "./daySchedule/daySchedule.routes";
import appointmentRoute from "./appointment/appointment.routes";
import childrenRoute from "./children/children.routes";

const apiRouter = Router();

apiRouter.use("/", indexRoute);
apiRouter.use("/users", userRoute);
apiRouter.use("/training-modes", trainingModeRoute);
apiRouter.use("/day-schedule", dayScheduleRoute);
apiRouter.use("/appointments", appointmentRoute);
apiRouter.use("/children", childrenRoute);
export default apiRouter;
