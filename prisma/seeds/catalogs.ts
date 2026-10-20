import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";
import { permissionsSeed } from "./permissions";

export const catalogsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('CATALOG', 'Initializing Base Catalogs');

    // 1. Roles
    const roles = [
        { name: 'ADMIN', value: 'Administrador' },
        { name: 'GUARD', value: 'Guardia' },
        { name: 'SHIFT', value: 'Jefe de Turno' },
        { name: 'MAINT', value: 'Mantenimiento' },
        { name: 'RESDN', value: 'Residente' },
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
            create: { ...type, isSystem: true },
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
            create: { ...status, isSystem: true },
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
            create: { ...type, isSystem: true },
        });
    }

    // 5. Catálogos de estados y tipos (T-F0-13): reflejan los valores de los enums.
    const enumCatalogs = {
        assignmentStatusCatalog: [['PENDING', 'Pendiente'], ['CHECKING', 'En revisión'], ['UNDER_REVIEW', 'Bajo revisión'], ['REVIEWED', 'Revisada'], ['ANOMALY', 'Anomalía']],
        invitationStatusCatalog: [['PENDING', 'Pendiente'], ['ENTERED', 'Ingresó'], ['EXITED', 'Salió'], ['EXPIRED', 'Vencida'], ['CANCELLED', 'Cancelada']],
        scanTypeCatalog: [['ASSIGNMENT', 'Asignación'], ['RECURRING', 'Recurrente'], ['FREE', 'Libre']],
        incidentStatusCatalog: [['PENDING', 'Pendiente'], ['ATTENDED', 'Atendido']],
        roundStatusCatalog: [['IN_PROGRESS', 'En curso'], ['COMPLETED', 'Completada']],
        maintenanceStatusCatalog: [['PENDING', 'Pendiente'], ['ATTENDED', 'Atendido']],
    } as const;

    for (const [model, values] of Object.entries(enumCatalogs)) {
        const delegate = (prisma as any)[model];
        for (const [index, [name, value]] of values.entries()) {
            await delegate.upsert({
                where: { name },
                update: { value, order: index },
                create: { name, value, order: index, isSystem: true },
            });
        }
    }

    hackerLog.success('CATALOG', 'Base catalogs synchronized');
    await permissionsSeed(prisma);
};
