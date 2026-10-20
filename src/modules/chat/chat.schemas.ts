import { z } from "zod";

// La vacía se rechaza en el controlador con su propio mensaje (se conserva el contrato).
export const createMessageBody = z.object({ message: z.string().max(2000) });
