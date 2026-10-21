/**
 * Máximo de filas que devuelve cualquier listado sin paginación por cursor.
 * Evita que una sola petición cargue toda la tabla en memoria (E-01).
 * Cuando un listado necesite más, se pagina por cursor, no se sube este número.
 */
export const LIST_MAX_ROWS = 200;

/**
 * Máximo de filas por página en los datatables. La WEB pide hasta 1000 (exportaciones y
 * selectores); más que eso nunca es una pantalla legítima y permitiría cargar toda una tabla.
 */
export const DATATABLE_MAX_LIMIT = 1000;
