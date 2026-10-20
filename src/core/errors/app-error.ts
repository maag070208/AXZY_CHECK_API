/**
 * Error de negocio con código estable. El cliente recibe `code` y `message`
 * en español; nunca detalles internos (E-19).
 * Ejemplo: throw new AppError("ROUND_ALREADY_ACTIVE", "Ya tienes una ronda activa", 400);
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}
