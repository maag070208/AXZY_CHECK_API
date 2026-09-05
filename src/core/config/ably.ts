import Ably from "ably";

/**
 * @description Realtime channel names shared across the API and the clients
 * (WEB/APP). Keep this the single source of truth so a typo can't silently
 * split publishers/subscribers onto different channels.
 */
export const ABLY_CHANNELS = {
  CHAT_TEAM: "chat:team",
  SHIFT_ALERTS: "shift-handover:alerts",
  DASHBOARD_LIVE: "dashboard:live-ops",
} as const;

/**
 * @description Lazily-initialized Ably REST client used by the API to publish
 * realtime events (chat messages, shift-handover alerts) and to mint
 * subscribe-only tokens for WEB/APP clients.
 *
 * IMPORTANT: Ably is always an enhancement, never a dependency. Every feature
 * that publishes here (chat, shift alerts) persists to Postgres first and
 * treats Postgres as the source of truth; clients also poll as a fallback.
 * If ABLY_KEY is missing or Ably is unreachable, REST endpoints must keep
 * working — only the "live" push is skipped.
 */
let ablyClient: Ably.Rest | null = null;
let ablyInitFailed = false;

const getAblyClient = (): Ably.Rest | null => {
  if (ablyInitFailed) return null;

  const apiKey = process.env.ABLY_KEY;
  if (!apiKey) {
    console.warn(
      "[Ably] ABLY_KEY no configurada. Las funciones en vivo (chat, alertas de turno, dashboard) " +
        "quedarán deshabilitadas; los endpoints REST siguen funcionando normalmente.",
    );
    ablyInitFailed = true;
    return null;
  }

  if (!ablyClient) {
    try {
      ablyClient = new Ably.Rest({ key: apiKey });
    } catch (error) {
      console.error("[Ably] No se pudo inicializar el cliente:", error);
      ablyInitFailed = true;
      return null;
    }
  }

  return ablyClient;
};

/**
 * @description Publishes an event to an Ably channel. Never throws — a
 * realtime publish failure must never break the REST flow that triggered it
 * (e.g. creating a chat message must still succeed even if the live push
 * fails or Ably is down).
 * @param channelName Ably channel name — use `ABLY_CHANNELS`.
 * @param eventName Event name published on the channel.
 * @param data JSON-serializable payload delivered to subscribers.
 */
export const publishToChannel = async (
  channelName: string,
  eventName: string,
  data: Record<string, unknown>,
): Promise<void> => {
  try {
    const client = getAblyClient();
    if (!client) return;
    const channel = client.channels.get(channelName);
    await channel.publish(eventName, data);
  } catch (error) {
    console.error(`[Ably] Error publicando en "${channelName}":`, error);
  }
};

/**
 * @description Creates a subscribe-only Ably TokenRequest for a client
 * (WEB/APP). Clients never receive the raw ABLY_KEY: they exchange this
 * TokenRequest for a short-lived token via the Ably SDK's `authCallback`.
 * Capability is restricted to "subscribe" on the realtime channels used by
 * the app — publishing always happens server-side, after persisting to
 * Postgres, never directly from a client.
 * @param clientId Stable identifier for the requesting user (e.g. `user-<id>`).
 * @returns The signed TokenRequest, or `null` if Ably is not configured/reachable.
 */
export const createSubscribeTokenRequest = async (
  clientId: string,
): Promise<Ably.TokenRequest | null> => {
  const client = getAblyClient();
  if (!client) return null;

  try {
    return await client.auth.createTokenRequest({
      clientId,
      capability: {
        [ABLY_CHANNELS.CHAT_TEAM]: ["subscribe"],
        [ABLY_CHANNELS.SHIFT_ALERTS]: ["subscribe"],
        [ABLY_CHANNELS.DASHBOARD_LIVE]: ["subscribe"],
      },
    });
  } catch (error) {
    console.error("[Ably] Error creando token request:", error);
    return null;
  }
};
