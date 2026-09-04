import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

export interface CreateUniformCheckInput {
  guardId: number;
  evaluatedById: number;
  pantalon: boolean;
  botas: boolean;
  cinturon: boolean;
  camisa: boolean;
  pluma: boolean;
  gorra: boolean;
  unas: boolean;
  orejas: boolean;
  desodorante: boolean;
  afeitado: boolean;
  peinado: boolean;
  notes?: string;
}

const include = {
  guard: { select: { id: true, name: true, lastName: true } },
  evaluatedBy: { select: { id: true, name: true, lastName: true } },
} as const;

/** @description Creates a uniform/grooming checklist entry for a guard. */
export const createUniformCheck = async (data: CreateUniformCheckInput) => {
  return prismaClient.uniformCheck.create({ data, include });
};

/** @description Paginated list for the WEB admin `ITDataTable`. */
export const getDataTableUniformChecks = async (
  params: ITDataTableFetchParams,
): Promise<ITDataTableResponse<any>> => {
  const prismaParams = getPrismaPaginationParams(params);

  const [rows, total] = await Promise.all([
    prismaClient.uniformCheck.findMany({
      ...prismaParams,
      include,
      orderBy: prismaParams.orderBy || { createdAt: "desc" },
    }),
    prismaClient.uniformCheck.count({ where: prismaParams.where }),
  ]);

  return { rows, total };
};

/** @description History of checklist entries for a single guard (APP). */
export const getUniformChecksByGuard = async (guardId: number) => {
  return prismaClient.uniformCheck.findMany({
    where: { guardId },
    include,
    orderBy: { createdAt: "desc" },
  });
};
