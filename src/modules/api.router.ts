import { Router } from "express";

import indexRoute from "./index.routes";
import healthRoute from "./health/health.routes";
import userRoute from "./users/user.routes";
import locationsRoute from "./locations/locations.routes";
import uploadRoute from "./common/upload.routes";
import kardexRoute from "./kardex/kardex.routes";
import assignmentsRoute from "./assignments/assignment.routes";
import recurringRoute from "./recurring/recurring.routes";
import incidentRoute from "./incidents/incident.routes";
import clubRoute from "./club/club.routes";
import roundRoute from "./rounds/round.routes";
import scheduleRoute from "./schedules/schedule.routes";
import maintenanceRoute from "./maintenance/maintenance.routes";
import reportRoute from "./reports/report.routes";
import propertiesRoute from "./properties/properties.routes";
import residentsRoute from "./residents/residents.routes";
import invitationsRoute from "./invitations/invitations.routes";
import catalogRoute from "./catalog/catalog.routes";
import catalogManagementRoute from "./catalog-management/catalog.routes";
import dashboardRoute from "./dashboard/dashboard.routes";
import novedadRoute from "./novedades/novedades.routes";
import syncRoute from "./sync/sync.routes";
import shiftCheckRoute from "./shift-check/shift-check.routes";
import uniformCheckRoute from "./uniform-check/uniform-check.routes";

const apiRouter = Router();

apiRouter.use("/", indexRoute);
apiRouter.use("/health", healthRoute);
apiRouter.use("/users", userRoute);
apiRouter.use("/locations", locationsRoute);
apiRouter.use("/uploads", uploadRoute);
apiRouter.use("/kardex", kardexRoute);
apiRouter.use("/assignments", assignmentsRoute);
apiRouter.use("/recurring", recurringRoute);
apiRouter.use("/incidents", incidentRoute);
apiRouter.use("/club", clubRoute);
apiRouter.use("/rounds", roundRoute);
apiRouter.use("/schedules", scheduleRoute);
apiRouter.use("/maintenance", maintenanceRoute);
apiRouter.use("/reports", reportRoute);
apiRouter.use("/properties", propertiesRoute);
apiRouter.use("/residents", residentsRoute);
apiRouter.use("/invitations", invitationsRoute);
// Mount catalog-management BEFORE catalog so specific routes like /incident-categories
// take precedence over the catch-all GET /catalog/:key in the legacy catalog router.
apiRouter.use("/catalog", catalogManagementRoute);
apiRouter.use("/catalog", catalogRoute);
apiRouter.use("/dashboard", dashboardRoute);
apiRouter.use("/novedades", novedadRoute);
apiRouter.use("/sync", syncRoute);
apiRouter.use("/shift-check", shiftCheckRoute);
apiRouter.use("/uniform-check", uniformCheckRoute);


export default apiRouter;
