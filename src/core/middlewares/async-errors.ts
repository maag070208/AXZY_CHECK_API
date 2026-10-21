/**
 * Express 4 no captura las promesas rechazadas de los controladores `async`: sin esto, un error
 * que se lanza (p. ej. un registro inexistente) deja la petición colgada y, en Node moderno,
 * tumba el proceso por "unhandled rejection". Este parche hace que el rechazo llegue a
 * `next(err)` y por tanto al manejador global de errores. Es el mismo enfoque que el paquete
 * `express-async-errors`, sin la dependencia.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Layer = require("express/lib/router/layer");

const PATCHED = Symbol.for("checkapp.asyncErrorsPatched");

if (!Layer.prototype[PATCHED]) {
  Layer.prototype[PATCHED] = true;
  Layer.prototype.handle_request = function handleRequest(req: unknown, res: { headersSent: boolean }, next: (err?: unknown) => void) {
    const fn = this.handle;
    if (fn.length > 3) return next();
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === "function") {
        result.catch((err: unknown) => {
          // Si ya se respondió no se puede mandar otro error; se delega igual a Express.
          next(err);
        });
      }
    } catch (err) {
      next(err);
    }
  };
}

export {};
