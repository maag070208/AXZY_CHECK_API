import Ably from "ably";
import { NOVEDADES_CHANNEL, NOVEDADES_EVENT } from "./novedades.constants";

/**
 * @description Servicio encargado de la integración con Ably para difundir
 * las novedades en tiempo real. Se usa la clave privada del servidor
 * (ABLY_KEY) únicamente aquí; los clientes reciben un token con capability
 * restringida emitido a través de {@link createTokenRequest}.
 */
export class AblyService {
  private readonly rest: Ably.Rest;

  constructor() {
    const key = process.env.ABLY_KEY;
    if (!key) {
      console.warn("[Ably] ABLY_KEY no está configurada; la difusión en tiempo real estará deshabilitada.");
      this.rest = new Ably.Rest({ key: "" });
      return;
    }
    this.rest = new Ably.Rest({ key });
  }

  /**
   * @description Indica si la integración con Ably está configurada.
   * @returns `true` si existe ABLY_KEY en el entorno.
   */
  isConfigured(): boolean {
    return Boolean(process.env.ABLY_KEY);
  }

  /**
   * @description Crea una solicitud de token (tokenRequest) firmada por el
   * servidor para que el cliente se autentique contra Ably sin exponer la
   * clave secreta. La capability está limitada a suscribirse al canal de
   * novedades; la publicación la realiza exclusivamente la API.
   * @param clientId Identificador del usuario (se usa su id de usuario).
   * @returns El tokenRequest listo para enviarse al cliente.
   * @throws Si la clave de Ably no está configurada.
   */
  async createTokenRequest(clientId: string) {
    if (!this.isConfigured()) {
      throw new Error("ABLY_KEY no está configurada");
    }
    return this.rest.auth.createTokenRequest({
      clientId,
      ttl: 60 * 60 * 1000,
      capability: {
        [NOVEDADES_CHANNEL]: ["subscribe"],
      },
    });
  }

  /**
   * @description Publica una novedad en el canal de Ably para que todos los
   * clientes suscritos la reciban en tiempo real.
   * @param novedad Payload con la novedad a difundir (id, autor, mensaje, fecha).
   * @returns Promesa que resuelve cuando el mensaje fue publicado.
   * @throws Si Ably no está configurado o la publicación falla.
   */
  async publishNovedad(novedad: Record<string, unknown>): Promise<void> {
    if (!this.isConfigured()) {
      console.warn("[Ably] No se pudo publicar la novedad: ABLY_KEY no configurada.");
      return;
    }
    await this.rest.channels.get(NOVEDADES_CHANNEL).publish(NOVEDADES_EVENT, novedad);
  }
}

/** @description Instancia única del servicio de Ably compartida por el módulo. */
export const ablyService = new AblyService();
