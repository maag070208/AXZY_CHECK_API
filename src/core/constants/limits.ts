/**
 * Máximo de filas que devuelve cualquier listado sin paginación por cursor.
 * Evita que una sola petición cargue toda la tabla en memoria (E-01).
 * Cuando un listado necesite más, se pagina por cursor, no se sube este número.
 */
export const LIST_MAX_ROWS = 200;
