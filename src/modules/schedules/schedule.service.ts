import { prismaClient } from "@src/core/config/database";
import { ITDataTableFetchParams, ITDataTableResponse } from "@src/core/dto/datatable.dto";
import { getPrismaPaginationParams } from "@src/core/utils/prisma-pagination.utils";

export const getDataTableSchedules = async (params: ITDataTableFetchParams): Promise<ITDataTableResponse<any>> => {
    const prismaParams = getPrismaPaginationParams(params);

    const [rows, total] = await Promise.all([
        prismaClient.schedule.findMany({
            ...prismaParams,
        }),
        prismaClient.schedule.count({
            where: prismaParams.where
        })
    ]);

    return { rows, total };
};

export const getSchedules = async () => {
    return prismaClient.schedule.findMany({
        where: { active: true },
        orderBy: { name: 'asc' }
    });
};

export const createSchedule = async (data: {
    name: string;
    startTime: string;
    endTime: string;
}) => {
    return prismaClient.schedule.create({
        data
    });
};

export const updateSchedule = async (id: number, data: {
    name?: string;
    startTime?: string;
    endTime?: string;
    active?: boolean;
}) => {
    return prismaClient.schedule.update({
        where: { id },
        data
    });
};

export const deleteSchedule = async (id: number) => {
    return prismaClient.schedule.delete({
        where: { id }
    });
};
