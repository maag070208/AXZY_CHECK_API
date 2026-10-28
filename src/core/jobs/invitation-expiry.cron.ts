import cron from "node-cron";
import { expirePendingInvitations } from "@src/modules/invitations/invitations.service";
import { LOCK_KEYS, withAdvisoryLock } from "@src/core/utils/advisory-lock";

/**
 * Revisa cada 5 minutos los pases que vencieron sin entrar. Marca EXPIRED y
 * encola el aviso para el residente. El advisory lock evita duplicados entre
 * réplicas; la función de servicio vuelve a filtrar por PENDING.
 */
export const runInvitationExpiryJob = async (): Promise<number | null> => {
  let expired: number | null = null;
  await withAdvisoryLock(LOCK_KEYS.INVITATION_EXPIRY, async () => {
    expired = await expirePendingInvitations();
  });
  return expired;
};

export const registerInvitationExpiryCron = (): void => {
  cron.schedule("*/5 * * * *", async () => {
    try {
      const count = await runInvitationExpiryJob();
      if (count) console.log(`[InvitationExpiry] pases vencidos=${count}`);
    } catch (error) {
      console.error("[InvitationExpiry] job falló:", error);
    }
  });
};
