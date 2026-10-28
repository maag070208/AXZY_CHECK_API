import "@src/core/middlewares/async-errors";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

//middlewares
import { prismaClient } from "@src/core/config/database";
import { redactResponseSecrets } from "@src/core/middlewares/redact-secrets.middleware";
import { signResponseMediaUrls } from "@src/core/middlewares/sign-media-urls.middleware";
import { errorHandler } from "@src/core/middlewares/error-handler.middleware";
import { requestContext } from "@src/core/middlewares/request-context.middleware";
import { rejectNullBytes } from "@src/core/middlewares/reject-null-bytes.middleware";

//router
import apiRouter from "@src/modules/api.router";
import { API_META } from "@src/core/constants/api-version";

//server
export const app = express();

// S-27: detrás de un proxy (Railway) la IP real viene en X-Forwarded-For. Sin esto, el límite por IP
// vería la IP del proxy para todos. TRUST_PROXY = número de saltos de confianza (producción: 1).
const trustProxyHops = Number(process.env.TRUST_PROXY ?? (process.env.NODE_ENV === "production" ? 1 : 0));
if (trustProxyHops > 0) app.set("trust proxy", trustProxyHops);

// Orígenes permitidos (S-05). Las apps nativas no envían Origin y no se ven afectadas.
// En producción se define CORS_ORIGINS en el entorno del cliente.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5002,http://localhost:5004")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use((_req, res, next) => {
  res.setHeader("X-API-Version", API_META.apiVersion);
  res.setHeader("X-API-Build", API_META.buildVersion);
  next();
});

app.use([
  requestContext,
  express.json({ limit: "1mb" }), // S-17 / E-17: límite de tamaño del body
  rejectNullBytes, // Postgres no admite \u0000 en textos: 400 en lugar de 500
  redactResponseSecrets, // ninguna respuesta lleva la clave password (S-09)
  signResponseMediaUrls, // las URLs de archivos salen firmadas y de vida corta (S-24)
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
  cors({ origin: allowedOrigins, credentials: true }),
  // S-28: registrar solo la ruta, sin la cadena de consulta (puede traer nombres, correos o códigos).
  morgan(
    ((tokens: any, req: any, res: any) =>
      [tokens.method(req, res), String(req.originalUrl ?? req.url).split("?")[0], tokens.status(req, res), tokens["response-time"](req, res) + "ms"].join(" ")) as any,
  ),
]);

// Documentación del contrato. Fuera de producción: en producción publicaría todo
// el mapa de endpoints a cualquiera (S-01 / hallazgo de documentación pública).
if (process.env.NODE_ENV !== "production") {
  app.use(
    "/swagger",
    swaggerUi.serve,
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const swaggerDocument = YAML.load("./swagger.yaml");
      const swaggerUiHandler = swaggerUi.setup(swaggerDocument);
      swaggerUiHandler(req, res, next);
    }
  );

  app.get("/swagger.json", (req, res) => {
    const swaggerDocument = YAML.load("./swagger.yaml");
    res.json(swaggerDocument);
  });
}


// app.use(apiValidator());

// Salud para el balanceador y los despliegues (E1). Fuera de /api/v1: sin token.
// /health = el proceso responde. /ready = el proceso además puede hablar con la base.
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
app.get("/ready", async (_req, res) => {
  try {
    await prismaClient.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: "ready" });
  } catch {
    return res.status(503).json({ status: "unavailable" });
  }
});

app.use("/api/v1", apiRouter);

app.use(errorHandler);


