import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

//middlewares
import { createTResult } from "@src/core/mappers/tresult.mapper";

//router
import apiRouter from "@src/modules/api.router";

//server
export const app = express();

// Orígenes permitidos (S-05). Las apps nativas no envían Origin y no se ven afectadas.
// En producción se define CORS_ORIGINS en el entorno del cliente.
const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:5002,http://localhost:5004")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use([
  express.json({ limit: "1mb" }), // S-17 / E-17: límite de tamaño del body
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
  cors({ origin: allowedOrigins }),
  morgan(process.env.NODE_ENV === "test" ? "tiny" : "dev"),
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

app.use("/api/v1", apiRouter);

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.log({ err });
    console.log({ err: err.errors });
    res
      .status(err.status || 500)
      .json(createTResult<any>(null, [err.message, err.errors]));
  }
);
