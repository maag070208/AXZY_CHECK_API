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
        for (let index = 0; index < values.length; index++) {
            const [name, value] = values[index];
            await delegate.upsert({
                where: { name },
                update: { value, order: index },
                create: { name, value, order: index, isSystem: true },
            });
        }
    }

    // 6. Ítems de checklist (T-F0-14): uniforme y entrega de turno.
    const checklistItems = {
        uniformItem: [['PANTALON', 'Pantalón'], ['BOTAS', 'Botas'], ['CINTURON', 'Cinturón'], ['CAMISA', 'Camisa'], ['PLUMA', 'Pluma'], ['GORRA', 'Gorra'], ['UNAS', 'Uñas'], ['OREJAS', 'Orejas'], ['DESODORANTE', 'Desodorante'], ['AFEITADO', 'Afeitado'], ['PEINADO', 'Peinado']],
        handoverChecklistItem: [['PHONES', 'Teléfonos'], ['TABLET', 'Tableta'], ['RADIOS', 'Radios'], ['KEYS', 'Llaves'], ['LOGBOOK', 'Bitácora'], ['CONSIGNAS', 'Consignas'], ['REPORTED_TO_ADMIN', 'Reportado a administración']],
    } as const;

    for (const [model, items] of Object.entries(checklistItems)) {
        const delegate = (prisma as any)[model];
        for (let index = 0; index < items.length; index++) {
            const [name, value] = items[index];
            await delegate.upsert({
                where: { name },
                update: { value, order: index },
                create: { name, value, order: index, isSystem: true },
            });
        }
    }

    // 7. Tipos de unidad y estados de ocupación (A1). Transiciones válidas como datos.
    const propertyKinds = [
        { code: 'HOUSE', name: 'Casa', isUnitContainer: false },
        { code: 'APARTMENT', name: 'Departamento', isUnitContainer: false },
        { code: 'COMMERCIAL', name: 'Local', isUnitContainer: false },
        { code: 'LOT', name: 'Terreno', isUnitContainer: false },
        { code: 'COMMON', name: 'Área común', isUnitContainer: false },
    ];
    for (const [index, kind] of propertyKinds.entries()) {
        await prisma.propertyKind.upsert({
            where: { code: kind.code },
            update: { name: kind.name, order: index },
            create: { ...kind, order: index, isSystem: true },
        });
    }

    const occupancyStatuses = [
        { code: 'VACANT', name: 'Vacía', isOccupied: false, allowsResidents: false },
        { code: 'OWNER_OCCUPIED', name: 'Habitada por propietario', isOccupied: true, allowsResidents: true },
        { code: 'RENTED', name: 'Rentada', isOccupied: true, allowsResidents: true },
        { code: 'FOR_RENT', name: 'En renta', isOccupied: false, allowsResidents: false },
        { code: 'FOR_SALE', name: 'En venta', isOccupied: false, allowsResidents: false },
        { code: 'UNDER_CONSTRUCTION', name: 'En construcción', isOccupied: false, allowsResidents: false },
        { code: 'BLOCKED', name: 'Bloqueada', isOccupied: false, allowsResidents: false },
    ];
    for (const [index, status] of occupancyStatuses.entries()) {
        await prisma.occupancyStatus.upsert({
            where: { code: status.code },
            update: { name: status.name, order: index },
            create: { ...status, order: index, isSystem: true },
        });
    }

    // Transiciones válidas. Bloqueada puede aplicarse desde cualquier estado.
    const transitions: [string, string][] = [
        ['VACANT', 'OWNER_OCCUPIED'], ['VACANT', 'RENTED'], ['VACANT', 'FOR_RENT'], ['VACANT', 'FOR_SALE'],
        ['VACANT', 'UNDER_CONSTRUCTION'], ['VACANT', 'BLOCKED'],
        ['FOR_RENT', 'RENTED'], ['FOR_RENT', 'VACANT'], ['FOR_RENT', 'BLOCKED'],
        ['RENTED', 'VACANT'], ['RENTED', 'OWNER_OCCUPIED'], ['RENTED', 'BLOCKED'],
        ['OWNER_OCCUPIED', 'VACANT'], ['OWNER_OCCUPIED', 'RENTED'], ['OWNER_OCCUPIED', 'BLOCKED'],
        ['FOR_SALE', 'VACANT'], ['FOR_SALE', 'BLOCKED'],
        ['UNDER_CONSTRUCTION', 'VACANT'], ['UNDER_CONSTRUCTION', 'BLOCKED'],
        ['BLOCKED', 'VACANT'],
    ];
    const statusIds = new Map((await prisma.occupancyStatus.findMany()).map((s) => [s.code, s.id]));
    for (const [from, to] of transitions) {
        await prisma.occupancyStatusTransition.upsert({
            where: { fromId_toId: { fromId: statusIds.get(from)!, toId: statusIds.get(to)! } },
            update: {},
            create: { fromId: statusIds.get(from)!, toId: statusIds.get(to)! },
        });
    }

    // 8. Tipos de residente (A2). isHouseholdMember decide si suma al conteo del hogar.
    const residentKinds = [
        { code: 'OWNER', name: 'Propietario', isHouseholdMember: true, canAuthorizeVisits: true, canHaveVehicle: true, hasAppAccess: true },
        { code: 'TENANT', name: 'Inquilino', isHouseholdMember: true, canAuthorizeVisits: true, canHaveVehicle: true, hasAppAccess: true },
        { code: 'FAMILY', name: 'Familiar', isHouseholdMember: true, canAuthorizeVisits: false, canHaveVehicle: true, hasAppAccess: false },
        { code: 'DOMESTIC', name: 'Empleado doméstico', isHouseholdMember: false, canAuthorizeVisits: false, canHaveVehicle: false, hasAppAccess: false },
        { code: 'AUTHORIZED', name: 'Persona autorizada permanente', isHouseholdMember: false, canAuthorizeVisits: false, canHaveVehicle: false, hasAppAccess: false },
        { code: 'CAREGIVER', name: 'Cuidador/a', isHouseholdMember: false, canAuthorizeVisits: false, canHaveVehicle: false, hasAppAccess: false },
    ];
    for (const [index, kind] of residentKinds.entries()) {
        await prisma.residentKind.upsert({
            where: { code: kind.code },
            update: { name: kind.name, order: index },
            create: { ...kind, order: index, isSystem: true },
        });
    }

    hackerLog.success('CATALOG', 'Base catalogs synchronized');
    await permissionsSeed(prisma);
};
