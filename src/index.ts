import { app } from "@src/app";
import { registerShiftAlertCron } from "@src/core/jobs/shift-alert.cron";
import { registerOutboxWorker } from "@src/core/jobs/outbox.cron";
import { prismaClient } from "@src/core/config/database";

const PORT = 4444;

// Entrega de turno: alertas automáticas 7:00 AM / 7:00 PM (ajustes/bonaterra_ajuste_2.md, 4.2)
registerShiftAlertCron();
registerOutboxWorker();

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});

server.timeout = 300000; // 5 minutes timeout for uploads

// Apagado ordenado: en cada despliegue, terminar peticiones en curso y cerrar la BD.
const shutdown = (signal: string) => {
  console.log(`[server] ${signal} recibido: cerrando...`);
  server.close(async () => {
    await prismaClient.$disconnect();
    process.exit(0);
  });
  // Si algo se queda colgado, no bloquear el despliegue más de 20 s.
  setTimeout(() => process.exit(1), 20000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
