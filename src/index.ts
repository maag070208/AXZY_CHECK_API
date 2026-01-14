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
const app = express();

const PORT = 4444;

app.use([
  express.json(),
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
  cors(),
  morgan("dev"),
]);
app.use("/uploads", express.static("public/uploads"));

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

// cron.schedule("15 8 * * *", () => {
//   console.log("⏳ Tarea programada ejecutada.");
// });

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
