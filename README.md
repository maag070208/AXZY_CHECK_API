# CheckApp API

API REST (Express + PostgreSQL + Prisma) para la operación de seguridad de un residencial (textos del cliente en `src/client/`): usuarios, ubicaciones, rondas, kardex, incidencias, mantenimiento, casa club, propiedades, residentes, invitaciones, reportes y comunicación del equipo.

## Swagger

Con el API corriendo:

- UI: `http://localhost:4444/swagger`
- JSON: `http://localhost:4444/swagger.json`
- Contrato fuente: [`swagger.yaml`](swagger.yaml) (OpenAPI 3.0.3)

## Desarrollo

```bash
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed

pnpm dev   # http://localhost:4444
```

Las variables de entorno viven en `.env` (no se versiona). El detalle de endpoints, convenciones, autenticación y modelos está en [`../docs/api/`](../docs/api/).
