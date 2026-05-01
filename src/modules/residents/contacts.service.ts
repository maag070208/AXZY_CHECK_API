import { prismaClient } from "@src/core/config/database";

export const getContactsByUserId = async (userId: number) => {
    return prismaClient.residentContact.findMany({
        where: { userId, active: true },
        orderBy: { name: 'asc' }
    });
};

export const createContact = async (userId: number, data: any) => {
    return prismaClient.residentContact.create({
        data: {
            ...data,
            userId
        }
    });
};

export const updateContact = async (id: number, data: any) => {
    return prismaClient.residentContact.update({
        where: { id },
        data
    });
};

export const deleteContact = async (id: number) => {
    return prismaClient.residentContact.update({
        where: { id },
        data: { active: false }
    });
};
