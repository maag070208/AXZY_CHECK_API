import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

export const catalogsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('CATALOG', 'Initializing Base Catalogs');

    // 1. Roles
    const roles = [
        { name: 'ADMIN', value: 'Administrador' },
        { name: 'GUARD', value: 'Guardia' },
        { name: 'SHIFT', value: 'Jefe de Turno' },
        { name: 'MAINT', value: 'Mantenimiento' },
    ];

    for (const role of roles) {
        await prisma.role.upsert({
            where: { name: role.name },
            update: { value: role.value },
            create: role,
        });
    }

    // 2. Property Types
    const propertyTypes = [
        { name: 'CASA', value: 'Casa Habitación' },
        { name: 'DEPA', value: 'Departamento' },
        { name: 'TERRE', value: 'Terreno' },
    ];

    for (const type of propertyTypes) {
        await prisma.propertyType.upsert({
            where: { name: type.name },
            update: { value: type.value },
            create: type,
        });
    }

    // 3. Property Status
    const propertyStatus = [
        { name: 'VACNT', value: 'Vacante' },
        { name: 'HABIT', value: 'Habitada' },
        { name: 'CONST', value: 'En Construcción' },
        { name: 'BLOCK', value: 'Bloqueada' },
    ];

    for (const status of propertyStatus) {
        await prisma.propertyStatus.upsert({
            where: { name: status.name },
            update: { value: status.value },
            create: status,
        });
    }

    // 4. Invitation Types
    const invitationTypes = [
        { name: 'VISITOR', value: 'Visita Común' },
        { name: 'PROVIDER', value: 'Proveedor / Delivery' },
        { name: 'SERVICE', value: 'Servicios Técnicos' },
        { name: 'RESIDENT', value: 'Residente' },
        { name: 'COMMON', value: 'Áreas Comunes' },
    ];

    for (const type of invitationTypes) {
        await prisma.invitationType.upsert({
            where: { name: type.name },
            update: { value: type.value },
            create: type,
        });
    }

    hackerLog.success('CATALOG', 'Base catalogs synchronized');
};
