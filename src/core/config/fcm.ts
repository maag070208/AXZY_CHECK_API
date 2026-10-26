import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

/**
 * Configuración de Firebase Cloud Messaging.
 *
 * FCM HTTP v1 (recomendado) usa una cuenta de servicio, no el server key.
 * `FCM_SERVER_KEY` se conserva para integraciones legacy mientras se migra;
 * si está vacío, el remitente push debe usar la cuenta de servicio.
 */
const normalizePrivateKey = (value: string | undefined) => (value ?? "").replace(/\\n/g, "\n");

export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  [key: string]: unknown;
}

const parseServiceAccount = (raw: string): FcmServiceAccount | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key) return null;
    return parsed as FcmServiceAccount;
  } catch {
    return null;
  }
};

export const fcmConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID ?? "",
  serverKey: process.env.FCM_SERVER_KEY ?? "",
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL ?? "",
  privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
  serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "",
  serviceAccountJson: process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "",
};

/** Credencial de servicio: JSON en variable, archivo local o campos individuales. */
export const loadFcmServiceAccount = (): FcmServiceAccount | null => {
  if (fcmConfig.serviceAccountJson) {
    const parsed = parseServiceAccount(fcmConfig.serviceAccountJson.trim());
    if (parsed) return parsed;
  }

  if (fcmConfig.serviceAccountPath) {
    const path = resolve(process.cwd(), fcmConfig.serviceAccountPath);
    if (existsSync(path)) {
      const parsed = parseServiceAccount(readFileSync(path, "utf8"));
      if (parsed) return parsed;
    }
  }

  if (fcmConfig.projectId && fcmConfig.clientEmail && fcmConfig.privateKey) {
    return {
      type: "service_account",
      project_id: fcmConfig.projectId,
      client_email: fcmConfig.clientEmail,
      private_key: fcmConfig.privateKey,
    };
  }

  return null;
};

export const isFcmConfigured = () =>
  Boolean(fcmConfig.projectId && (fcmConfig.serverKey || loadFcmServiceAccount()));
