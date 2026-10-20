/**
 * [T-F0-11] Canal push detrás de una interfaz. Producción usará FCM; las pruebas
 * usan un fake. Sin remitente configurado no se envía push: la notificación
 * sigue visible en la app.
 */
export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** El proveedor dice que el token ya no sirve (app desinstalada, token revocado). */
export class PushTokenInvalidError extends Error {}

export interface PushSender {
  send(token: string, message: PushMessage): Promise<void>;
}

let sender: PushSender | null = null;

export const setPushSender = (next: PushSender | null): void => {
  sender = next;
};

export const getPushSender = (): PushSender | null => sender;
