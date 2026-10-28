/**
 * Lista blanca de rutas que NO exigen token. Todo lo demás del API exige
 * `authenticate` (ver api.router.ts). Mantener esta lista mínima: cada entrada
 * nueva necesita justificación y prueba en tests/security.
 *
 * Las rutas se comparan contra la ruta relativa a /api/v1 (p. ej. "/users/login").
 */
export const PUBLIC_ROUTES: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/" }, // health check
  { method: "GET", path: "/meta" }, // versión/contrato para la APP
  { method: "POST", path: "/users/login" },
  { method: "POST", path: "/users/refresh" },
];

export const isPublicRoute = (method: string, path: string): boolean =>
  PUBLIC_ROUTES.some((r) => r.method === method.toUpperCase() && r.path === path);
