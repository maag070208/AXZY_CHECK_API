# Reporte PDF de Incidencias — Estructura de datos

## Endpoint

```
GET /api/v1/reports/incidents/pdf
```

**Autenticación:** Bearer JWT (rol autenticado).

## Query params

| Param | Tipo | Requerido | Default | Descripción |
| --- | --- | --- | --- | --- |
| `startDate` | ISO 8601 datetime | Sí | — | Inicio del rango (inclusive, 00:00:00.000) |
| `endDate` | ISO 8601 datetime | Sí | — | Fin del rango (inclusive, 23:59:59.999) |
| `ids` | string CSV (ej. `1,4,7`) | No | `[]` (todas) | IDs específicos a incluir |
| `includeImages` | `"true" \| "false"` | No | `true` | Si renderiza la sección de evidencia |
| `includeLocation` | `"true" \| "false"` | No | `true` | Si renderiza la sección de ubicación GPS |

## Respuestas

- `200` — `application/pdf` (binario). `Content-Disposition: attachment; filename="reporte-incidencias-YYYY-MM-DD.pdf"`
- `400` — Validación Zod fallida (fechas inválidas)
- `401` — Sin token
- `500` — Error inesperado

## Estructura del PDF generado

### Página 1 — Portada + Resumen ejecutivo

| Sección | Contenido | Origen |
| --- | --- | --- |
| Banda superior | Logo "AC", nombre de la app, fecha de emisión, código de referencia | `APP_NAME` (env), `new Date()`, hash de items |
| Título | "REPORTE EJECUTIVO / Incidencias de Seguridad" + periodo | `startDate`, `endDate` |
| KPIs (4 tarjetas) | Total, Pendientes, Atendidas, Con Evidencia | derivado de `items[]` |
| Resumen ejecutivo (bullets) | Total, % resolución, top categorías, count con GPS | derivado de `items[]` |
| Distribución por categoría (tabla) | Categoría · Total · Pend. · Atend. · Barra % | `items[].categoryName`, `items[].status` |

### Página 2+ — Detalle de incidencias

Una tarjeta por incidencia. Estructura de cada tarjeta:

| Campo | Origen (DTO) | Render |
| --- | --- | --- |
| `#NN` índice | posición en `items[]` | badge slate-900 |
| Título | `IncidentReportItem.title` | bold slate-900 |
| Status pill | `IncidentReportItem.status` | "ATENDIDA" verde / "PENDIENTE" rojo, con dot |
| Subtítulo categoría/tipo | `categoryName`, `typeName` | chips en gris |
| Reportado | `createdAt` | `formatDateTime()` |
| Por | `guardName`, `guardUsername` | grid 1 |
| ID | `id` | grid 2 emerald-700 |
| Atendido por | `resolvedByName`, `resolvedAt` | grid 3 (solo si ATTENDED) |
| Descripción | `description` | bloque justificado (opcional) |
| Ubicación | `latitude`, `longitude` | coords + link Google Maps (opcional, flag `includeLocation`) |
| Evidencia | `media[]` | tile por archivo con URL como link (opcional, flag `includeImages`) |

### Chrome

- **Páginas internas**: header slate-900 con banda emerald, logo "AC", nombre del documento, label "Documento Ejecutivo".
- **Footer en todas las páginas**: marca + "Confidencial" (izquierda) y "Página N de M" (derecha).
- **Portada**: footer simplificado con marca y fecha de generación.

## Modelo de datos (DTO interno)

`API/src/modules/reports/incident-report.dto.ts`:

```ts
export interface IncidentMediaItem {
  type: "IMAGE" | "VIDEO";
  url: string;
  key?: string;
}

export interface IncidentReportItem {
  id: number;
  title: string;
  description: string | null;
  status: "PENDING" | "ATTENDED";
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedByName: string | null;
  guardName: string;
  guardUsername: string;
  categoryName: string | null;
  typeName: string | null;
  latitude: number | null;
  longitude: number | null;
  media: IncidentMediaItem[];
}
```

## Fuente de los datos (Prisma)

`API/src/modules/reports/incident-report.service.ts` → `getIncidentsForReport({ startDate, endDate, ids? })`:

```ts
prismaClient.incident.findMany({
  where: {
    createdAt: { gte: rangeStart, lte: rangeEnd },
    ...(ids && ids.length > 0 ? { id: { in: ids } } : {}),
  },
  orderBy: { createdAt: "desc" },
  include: {
    guard:      { select: { name, lastName, username } },
    resolvedBy: { select: { name, lastName } },
    category:   { select: { value } },
    type:       { select: { value } },
  },
});
```

El service mapea el resultado a `IncidentReportItem[]`:

- `guardName` ← `${guard.name} ${guard.lastName}`.trim() || "Sin asignar"
- `resolvedByName` ← `${resolvedBy.name} ${resolvedBy.lastName}`.trim() || null
- `media` ← `incident.media` (Json) → array filtrado de `{ type, url, key? }`
- `latitude` / `longitude` ← campos directos (nullable)

## Esquema Prisma relacionado

`API/prisma/schema.prisma`:

```prisma
model Incident {
  id           Int               @id @default(autoincrement())
  guardId      Int
  title        String
  description  String?
  media        Json?
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  resolvedAt   DateTime?
  resolvedById Int?
  status       IncidentStatus    @default(PENDING)
  categoryId   Int?
  typeId       Int?
  latitude     Float?
  longitude    Float?
  category     IncidentCategory? @relation(fields: [categoryId], references: [id])
  guard        User              @relation(fields: [guardId], references: [id])
  resolvedBy   User?             @relation("IncidentResolver", fields: [resolvedById], references: [id])
  type         IncidentType?     @relation(fields: [typeId], references: [id])
}
```

`IncidentStatus` es un enum Prisma con valores `PENDING` y `ATTENDED`.

## Pipeline del controller

`API/src/modules/reports/incident-report.controller.ts` → `getIncidentsPdf`:

1. **Validar query** con Zod (`incidentPdfQuerySchema`).
2. **Construir** `renderOptions: { includeImages, includeLocation }` y `appName` (env `APP_NAME`, fallback `"AXZY CHECK"`).
3. **Crear documento PDFKit** A4 con `bufferPages: true` y metadatos (`Title`, `Author`, `Subject`, `Keywords`).
4. **Generar portada** → `renderCover(doc, startDate, endDate, items, appName, options)`.
5. **Generar detalle** → `renderIncidentsSection(doc, items, startDate, endDate, appName, options)`.
6. **Aplicar chrome** (headers/footers por página) → `applyExecutiveChrome(doc, appName)`.
7. **Piping** directo a `res` con `Content-Type: application/pdf` y `Content-Disposition: attachment`.
8. **Manejo de error**:
   - Antes de pipear → `res.status(500).json({...TResult})`.
   - Después de pipear (headers enviados) → `res.end()`.

## Paleta de colores (PDF)

| Token | Hex | Uso |
| --- | --- | --- |
| `emerald900` | `#064e3b` | Banda superior portada |
| `emerald700` | `#0f766e` | Acentos, títulos primarios |
| `emerald600` | `#0d9488` | Barras, íconos |
| `emerald500` | `#10b981` | Logo badge |
| `emerald50` | `#ecfdf5` | Pills atendidas |
| `red600` | `#dc2626` | Estado pendiente |
| `red50` | `#fef2f2` | Pills pendientes |
| `green600` | `#16a34a` | Estado atendido |
| `green50` | `#f0fdf4` | Cards atendidas |
| `amber600` | `#d97706` | Card "con evidencia" |
| `amber50` | `#fffbeb` | Fondo card evidencia |
| `slate900` | `#0f172a` | Header chrome, títulos |
| `slate800` | `#1e293b` | Texto principal |
| `slate500` | `#64748b` | Texto secundario, labels |
| `slate200` | `#e2e8f0` | Bordes, separadores |
| `slate50` | `#f8fafc` | Filas alternas, evidencia bg |
| `white` | `#ffffff` | Fondo de tarjetas |

## Archivos

- `API/src/modules/reports/incident-report.controller.ts` — generación PDF (pdfkit).
- `API/src/modules/reports/incident-report.service.ts` — query Prisma + mapeo a DTO.
- `API/src/modules/reports/incident-report.dto.ts` — Zod schema + interfaces.
- `API/src/modules/reports/incident-report.routes.ts` — router `GET /incidents/pdf`.
- `API/src/modules/reports/report.routes.ts` — monta el router (auth global).
- `API/swagger.yaml` — documentación del endpoint bajo tag `reports`.

## Cliente (frontend)

- `WEB/src/modules/incidents/services/IncidentService.ts` → `downloadIncidentsPdf(filters)`.
  - Tipo `IncidentPdfFilters`: `{ startDate: Date; endDate: Date; ids?: number[]; includeImages?: boolean; includeLocation?: boolean }`.
  - Pasa flags como `includeImages=true|false` y `includeLocation=true|false` en query.
  - Recibe `Blob` (`responseType: "blob"`), crea `<a download>` con `URL.createObjectURL` y dispara la descarga.
- `WEB/src/modules/incidents/components/IncidentReportModal.tsx` — modal con rango, checks por fila, switches `Adjuntar imágenes` / `Adjuntar ubicación`, botón "Generar Reporte PDF".
