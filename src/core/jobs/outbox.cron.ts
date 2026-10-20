import cron from "node-cron";
import { processOutbox } from "@src/core/outbox/outbox";
import { logger } from "@src/core/logger/logger";

/** Procesa el outbox cada 30 s. Varias instancias pueden correr esto: el reclamo usa SKIP LOCKED. */
export const registerOutboxWorker = (): void => {
  cron.schedule("*/30 * * * * *", async () => {
    try {
      await processOutbox();
    } catch (error) {
      logger.error({ err: error }, "outbox worker failed");
    }
  });
};
