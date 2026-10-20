/**
 * Inventario de rutas del API real, recorriendo la pila de Express.
 * Sirve para que las pruebas de seguridad cubran TODAS las rutas, incluidas
 * las que se agreguen en el futuro, sin mantener listas a mano.
 */
import type { Express } from "express";

export interface RouteEntry {
  method: "get" | "post" | "put" | "patch" | "delete";
  /** Ruta completa desde la raíz de la app, con parámetros reemplazados por "1". */
  path: string;
  /** Ruta con sus parámetros originales (p. ej. "/users/:id"). */
  pattern: string;
  /** Tiene un middleware validate() (Zod) en su cadena. */
  validated: boolean;
}

/** Convierte el regexp de montaje de Express 4 en un prefijo de ruta. */
const mountPrefix = (layer: any): string => {
  const src: string = layer.regexp?.source ?? "";
  let s = src.replace(/^\^/, "");
  const tail = "\\/?(?=\\/|$)";
  if (s.endsWith(tail)) s = s.slice(0, -tail.length);
  return s.replace(/\\\//g, "/");
};

const walk = (stack: any[], prefix: string, out: RouteEntry[]): void => {
  for (const layer of stack) {
    if (layer.route) {
      const routePath: string = layer.route.path;
      for (const method of Object.keys(layer.route.methods)) {
        if (!layer.route.methods[method]) continue;
        const full = `${prefix}${routePath}`.replace(/\/{2,}/g, "/") || "/";
        const validated = (layer.route.stack ?? []).some((l: any) => l.handle?.validates === true);
        out.push({
          method: method as RouteEntry["method"],
          pattern: full,
          path: full.replace(/:[A-Za-z_]+/g, "1"),
          validated,
        });
      }
    } else if (layer.name === "router" && layer.handle?.stack) {
      walk(layer.handle.stack, `${prefix}${mountPrefix(layer)}`, out);
    } else if (layer.handle?._router?.stack) {
      // Algunos módulos usan `import Router from "express"` y llaman Router(),
      // lo que crea una app completa (no un router). Hay que recorrerla igual.
      walk(layer.handle._router.stack, `${prefix}${mountPrefix(layer)}`, out);
    }
  }
};

/** Devuelve todas las rutas HTTP registradas en la app. */
export const listRoutes = (app: Express): RouteEntry[] => {
  const out: RouteEntry[] = [];
  walk((app as any)._router.stack, "", out);
  return out;
};
