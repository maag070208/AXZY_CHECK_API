import cron from "node-cron";
import { prismaClient } from "@src/core/config/database";
import { applyLateFees, generateCollectionCharges } from "@src/modules/collections/collections.service";

/**
 * Job diario de cobranza: genera las cuotas cuyo `nextChargeDate` ya llegó y
 * aplica recargos a los cargos vencidos. Es idempotente; si hoy no toca nada,
 * no crea registros. Usa el primer ADMIN activo como autor de los cargos.
 */
export const runCollectionsJob = async () => {
  const admin = await prismaClient.user.findFirst({
    where: { active: true, softDelete: false, role: { name: "ADMIN" } },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!admin) return { skipped: true as const };

  const generated = await generateCollectionCharges(admin.id, {});
  const lateFees = await applyLateFees(admin.id, {});
  return { skipped: false as const, generated, lateFees };
};

export const registerCollectionsCron = () => {
  // 06:00 hora del servidor; la generación es idempotente, así que reintentos no duplican.
  cron.schedule("0 6 * * *", async () => {
    try {
      const result = await runCollectionsJob();
      if (!result.skipped) {
        console.log(
          `[Collections] cuotas creadas=${result.generated.created} recargos=${result.lateFees.created}`,
        );
      }
    } catch (error) {
      console.error("[Collections] job diario falló:", error);
    }
  });
};
