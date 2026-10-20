import { CatalogDefinition } from "./catalog-factory";

/**
 * Registro de catálogos administrables. Agregar un catálogo = agregar una entrada.
 * La WEB construye la pantalla de Catálogos desde este registro.
 */
export const CATALOG_REGISTRY: CatalogDefinition[] = [
  { key: "property-types", label: "Tipos de propiedad", model: "propertyType" },
  { key: "property-statuses", label: "Estados de propiedad", model: "propertyStatus" },
  { key: "invitation-types", label: "Tipos de invitación", model: "invitationType" },
  { key: "resident-relationships", label: "Parentescos", model: "residentRelationship" },
  { key: "incident-categories", label: "Categorías de incidente", model: "incidentCategory" },
  { key: "incident-types", label: "Tipos de incidente", model: "incidentType", parentField: "categoryId" },
];
