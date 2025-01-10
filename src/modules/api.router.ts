import { Router } from "express";

import indexRoute from "./index.routes";
import clientRoute from "./clients/client.routes";
import paymentRoute from "./payments/payment.routes";
import mailRoute from "./mail/mail.routes";
import fileRoute from "./files/files.routes";
import userRoute from "./users/user.routes";
const apiRouter = Router();

apiRouter.use("/", indexRoute);
apiRouter.use("/users", userRoute);
apiRouter.use("/clients", clientRoute);
apiRouter.use("/payments", paymentRoute);
apiRouter.use("/mail", mailRoute);
apiRouter.use("/files", fileRoute);

export default apiRouter;
