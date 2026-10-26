import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { loadFcmServiceAccount, fcmConfig } from "@src/core/config/fcm";
import { PushMessage, PushSender, PushTokenInvalidError, setPushSender } from "./push-sender";

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/** Inicializa FCM HTTP v1 con la cuenta de servicio y registra el remitente push. */
export const registerFirebasePush = (): void => {
  const serviceAccount = loadFcmServiceAccount();
  if (!serviceAccount) {
    console.warn("[FCM] Sin cuenta de servicio configurada; el push queda deshabilitado.");
    return;
  }

  try {
    const app = getApps()[0] ?? initializeApp({
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId: serviceAccount.project_id ?? fcmConfig.projectId,
    });
    const messaging = getMessaging(app);

    const sender: PushSender = {
      async send(token: string, message: PushMessage) {
        try {
          await messaging.send({
            token,
            notification: { title: message.title, body: message.body },
            data: message.data,
          });
        } catch (error) {
          const code = (error as { code?: string }).code ?? "";
          if (INVALID_TOKEN_CODES.has(code)) throw new PushTokenInvalidError();
          throw error;
        }
      },
    };

    setPushSender(sender);
    console.log(`[FCM] Push habilitado con la cuenta ${serviceAccount.client_email}`);
  } catch (error) {
    console.error("[FCM] No se pudo inicializar Firebase Admin:", error);
  }
};
