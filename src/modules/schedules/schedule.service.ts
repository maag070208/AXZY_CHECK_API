import { prismaClient } from "@src/core/config/database";
import { AppError } from "@src/core/errors/app-error";
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
    // La relación es opcional (SetNull): sin esta revisión el borrado dejaría al personal sin
    // horario y el login los rechazaría. Así lo que el controlador promete se cumple.
    const assigned = await prismaClient.user.count({ where: { scheduleId: id, softDelete: false } });
    if (assigned > 0) {
        throw new AppError("SCHEDULE_IN_USE", "Este horario está asignado a uno o más guardias y no puede ser eliminado.", 400);
    }
    return prismaClient.schedule.delete({
        where: { id }
    });
};
