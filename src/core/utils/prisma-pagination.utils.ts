import { ITDataTableFetchParams } from "../dto/datatable.dto";
import { DATATABLE_MAX_LIMIT } from "../constants/limits";

/** Filas por página: el valor pedido, entre 1 y DATATABLE_MAX_LIMIT (10 si no es un número). */
export const clampLimit = (limit: unknown): number => {
  const n = Math.trunc(Number(limit));
  return n > 0 ? Math.min(n, DATATABLE_MAX_LIMIT) : 10;
};

/**
 * Converts ITDataTableFetchParams into Prisma query options.
 * Handles pagination (skip/take), sorting (orderBy), and filtering (where).
 */
export function getPrismaPaginationParams(params: ITDataTableFetchParams) {
  const { page, limit, filters, sort } = params ?? ({} as ITDataTableFetchParams);

  // Pagination
  const take = clampLimit(limit);
  const skip = (Math.max(1, Math.trunc(Number(page)) || 1) - 1) * take;

  // Sorting
  const orderBy = sort?.key
    ? { [sort.key]: sort.direction || "asc" }
    : { id: "desc" as const }; // Default sort

  // Filtering
  const where: any = {};
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "" || key === "refreshKey") return;

      // String filtering
      if (typeof value === "string") {
        // If it's an ID field, try to parse it as a number for exact match
        if (key.toLowerCase().endsWith('id')) {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            where[key] = numValue;
            return;
          }
        }

        // Enums and Status must be exact match (Prisma doesn't support 'contains' on enums)
        const isStatus = key === "status";
        const isEnum = /^[A-Z_]+$/.test(value); // Heuristic for enum values (COMPLETED, IN_PROGRESS, etc)

        if (isStatus || isEnum) {
            where[key] = value;
            return;
        }

        // Default string search: contains + insensitive
        where[key] = {
          contains: value,
          mode: "insensitive",
        };
      } 
      // Boolean and Number: exact match
      else {
        where[key] = value;
      }
    });
  }

  return {
    skip,
    take,
    where,
    orderBy,
  };
}
