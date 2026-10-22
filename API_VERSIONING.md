# Versionado de la API

## Dos versiones

1. **`apiVersion` (contrato)** — semver (`major.minor.patch`) en
   `src/core/constants/api-version.ts`.
   - `patch`: fix compatible.
   - `minor`: nueva capacidad compatible.
   - `major`: cambio incompatible; la APP debe actualizarse.
2. **`buildVersion`** — identifica el deploy exacto. Se toma de
   `RAILWAY_GIT_COMMIT_SHA` / `GIT_COMMIT_SHA` / `GIT_COMMIT`. Cambia solo en
   cada deploy, sin ensuciar el contrato.

## Endpoint público

`GET /api/v1/meta`

```json
{
  "data": {
    "apiVersion": "1.1.0",
    "apiMajor": 1,
    "minAppVersion": "1.0.23",
    "capabilities": ["offline.clientRef", "uploads.idempotency"],
    "buildVersion": "abc123",
    "serverTime": "2026-10-21T19:40:00.000Z"
  },
  "messages": ["Success"],
  "success": true
}
```

Todas las respuestas llevan:

- `X-API-Version`
- `X-API-Build`

## Cuándo subir la versión

| Cambio | Acción |
|---|---|
| Fix interno sin cambiar contrato | `patch` |
| Nuevo endpoint/campo opcional/capacidad | `minor` |
| Cambio incompatible de payload/semántica | `major` + actualizar APP |

Comando:

```bash
npm run api:version -- minor "reportes offline"
```

Actualiza `API_VERSION`, `package.json` y `API_CHANGELOG.md`.

## Regla para la APP

- Misma `apiMajor` → compatible.
- `minAppVersion` mayor que la versión instalada → bloquear con “Actualiza CheckApp”.
- Sin red → usar la última metadata cacheada; no bloquear por falta de conexión.
