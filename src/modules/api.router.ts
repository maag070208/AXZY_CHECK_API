import { Router } from "express";
import { requireAuthUnlessPublic } from "./common/middlewares/require-auth-unless-public.middleware";
import { requireStaff } from "./common/middlewares/role-scope.middleware";

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
import complaintsRoute from "./complaints/complaints.routes";
import residentsRoute from "./residents/residents.routes";
import chargesRoute from "./finance/charges.routes";
import paymentsRoute from "./finance/payments.routes";
import financeRoute from "./finance/finance.routes";
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
import syncRoute from "./sync/sync.routes";
import rbacRoute from "./rbac/rbac.routes";


const apiRouter = Router();

// Guard global: todo exige token salvo la lista blanca (core/routes/public.ts).
// Debe ir ANTES de montar cualquier módulo.
// Los módulos operativos (rondas, bitácora, incidencias…) solo los usa el personal: `requireStaff`
// deja fuera al residente, que con solo sesión podía leerlos.
apiRouter.use(requireAuthUnlessPublic);

apiRouter.use("/", indexRoute);
apiRouter.use("/users", userRoute);
apiRouter.use("/locations", requireStaff, locationsRoute);
apiRouter.use("/uploads", uploadRoute);
apiRouter.use("/kardex", requireStaff, kardexRoute);
apiRouter.use("/assignments", requireStaff, assignmentsRoute);
apiRouter.use("/recurring", recurringRoute);
apiRouter.use("/incidents", requireStaff, incidentRoute);
apiRouter.use("/club", requireStaff, clubRoute);
apiRouter.use("/rounds", requireStaff, roundRoute);
apiRouter.use("/schedules", requireStaff, scheduleRoute);
apiRouter.use("/maintenance", requireStaff, maintenanceRoute);
apiRouter.use("/reports", requireStaff, reportRoute);
apiRouter.use("/properties", propertiesRoute);
apiRouter.use("/residents", residentsRoute);
apiRouter.use("/invitations", invitationsRoute);
apiRouter.use("/complaints", complaintsRoute);
// Finanzas del residente (módulo 13): ADMIN registra cargos/pagos; el residente
// consulta lo suyo desde /residents/me/*.
apiRouter.use("/charges", requireStaff, chargesRoute);
apiRouter.use("/payments", requireStaff, paymentsRoute);
apiRouter.use("/finance", requireStaff, financeRoute);
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
apiRouter.use("/sync", requireStaff, syncRoute);
apiRouter.use("/rbac", rbacRoute);

// Catálogos administrables (T-F0-04): un router generado por cada entrada del registro.
apiRouter.get("/catalogs", (_req, res) =>
  res.status(200).json({ data: CATALOG_REGISTRY.map((c) => ({ key: c.key, label: c.label })), messages: ["Success"], success: true }),
);
for (const def of CATALOG_REGISTRY) {
  apiRouter.use(`/catalogs/${def.key}`, createCatalogRouter(def));
}


export default apiRouter;
