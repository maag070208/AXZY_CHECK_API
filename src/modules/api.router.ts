import { Router } from "express";
import { requireAuthUnlessPublic } from "./common/middlewares/require-auth-unless-public.middleware";

import indexRoute from "./index.routes";
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
import catalogAdminRoute from "./catalog-admin/catalog-admin.routes";
import chatRoute from "./chat/chat.routes";
import realtimeRoute from "./realtime/realtime.routes";
import shiftHandoverRoute from "./shift-handover/shift-handover.routes";
import uniformRoute from "./uniform/uniform.routes";
import dashboardRoute from "./dashboard/dashboard.routes";
import { createCatalogRouter } from "@src/core/catalogs/catalog-factory";
import { CATALOG_REGISTRY } from "@src/core/catalogs/registry";
import settingsRoute from "./settings/settings.routes";
import mediaRoute from "./media/media.routes";
import buildingsRoute from "./buildings/buildings.routes";
import personsRoute from "./persons/persons.routes";
import authorizationsRoute from "./authorizations/authorizations.routes";


const apiRouter = Router();

// Guard global: todo exige token salvo la lista blanca (core/routes/public.ts).
// Debe ir ANTES de montar cualquier módulo.
apiRouter.use(requireAuthUnlessPublic);

apiRouter.use("/", indexRoute);
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
apiRouter.use("/catalog", catalogRoute);
apiRouter.use("/catalog-admin", catalogAdminRoute);
apiRouter.use("/chat", chatRoute);
apiRouter.use("/realtime", realtimeRoute);
apiRouter.use("/shift-handover", shiftHandoverRoute);
apiRouter.use("/uniform", uniformRoute);
apiRouter.use("/dashboard", dashboardRoute);
apiRouter.use("/settings", settingsRoute);
apiRouter.use("/media", mediaRoute);
apiRouter.use("/buildings", buildingsRoute);
apiRouter.use("/persons", personsRoute);
apiRouter.use("/authorizations", authorizationsRoute);

// Catálogos administrables (T-F0-04): un router generado por cada entrada del registro.
apiRouter.get("/catalogs", (_req, res) =>
  res.status(200).json({ data: CATALOG_REGISTRY.map((c) => ({ key: c.key, label: c.label })), messages: ["Success"], success: true }),
);
for (const def of CATALOG_REGISTRY) {
  apiRouter.use(`/catalogs/${def.key}`, createCatalogRouter(def));
}


export default apiRouter;
