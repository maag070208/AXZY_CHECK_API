import { prismaClient } from "@src/core/config/database";

export enum CatalogKey {
    PROPERTY_TYPE = 'property_type',
    PROPERTY_STATUS = 'property_status',
    INVITATION_TYPE = 'invitation_type',
    RESIDENT_RELATIONSHIP = 'resident_relationship',
    ROLE = 'role',
    PROPERTY = 'property',
    INVITATION_STATUS = 'invitation_status',
    GUARD = 'guard',
    INCIDENT_CATEGORY = 'incident_category',
    INCIDENT_TYPE = 'incident_type'
}

export const getCatalog = async (key: string) => {
    console.log(`[CatalogService] Fetching catalog for key: ${key}`);
    const selectFields = { id: true, name: true, value: true };
    try {
        switch (key) {
        case CatalogKey.PROPERTY_TYPE:
            return prismaClient.propertyType.findMany({ select: selectFields });
        case CatalogKey.PROPERTY_STATUS:
            return prismaClient.propertyStatus.findMany({ select: selectFields });
        case CatalogKey.INVITATION_TYPE:
            return prismaClient.invitationType.findMany({ select: selectFields });
        case CatalogKey.INVITATION_STATUS:
            return [
                { id: 1, name: 'PENDING', value: 'En Espera' },
                { id: 2, name: 'ENTERED', value: 'Dentro' },
                { id: 3, name: 'EXITED', value: 'Salió' },
                { id: 4, name: 'EXPIRED', value: 'Expirada' },
                { id: 5, name: 'CANCELLED', value: 'Revocada' }
            ];
        case CatalogKey.RESIDENT_RELATIONSHIP:
            return prismaClient.residentRelationship.findMany({ select: selectFields });
        case CatalogKey.ROLE:
            return prismaClient.role.findMany({ select: selectFields });
        case CatalogKey.INCIDENT_CATEGORY:
            return prismaClient.incidentCategory.findMany({ 
                select: { ...selectFields, color: true, icon: true, type: true } 
            });
        case CatalogKey.INCIDENT_TYPE:
            return prismaClient.incidentType.findMany({ 
                select: { ...selectFields, categoryId: true } 
            });
        case CatalogKey.PROPERTY:
            const properties = await prismaClient.property.findMany({ 
                where: { softDelete: false },
                select: { id: true, identifier: true, name: true },
                orderBy: { identifier: 'asc' }
            });
            return properties.map(p => ({ id: p.id, name: p.identifier, value: p.name }));
        case CatalogKey.GUARD:
            const guards = await prismaClient.user.findMany({
                where: { 
                    role: { name: 'GUARD' }, 
                    softDelete: false,
                    active: true
                },
                select: { id: true, name: true, lastName: true },
                orderBy: { name: 'asc' }
            });
            return guards.map(g => ({ id: g.id, name: g.name, value: `${g.name} ${g.lastName}` }));
        default:
            throw new Error(`Catalog key "${key}" not found`);
    }
  } catch (error: any) {
    console.error(`[CatalogService] Error fetching catalog "${key}":`, error);
    throw error;
  }
};
