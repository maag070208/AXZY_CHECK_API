import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

/**
 * @description Poblador del catálogo propio de Casa Club.
 * Reclasifica la categoría "CASA_CLUB" existente al discriminador `CASA_CLUB`
 * (sáldola de las incidencias) y garantiza sus tipos, sin generar categorías
 * paralelas CLUB_*. Es idempotente: re-ejecutarlo es seguro.
 */
export const clubCatalogsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('SEED', 'Populating Casa Club Catalogs...');

    const casaClubCategory = {
        name: 'CASA_CLUB',
        value: 'Casa Club',
        type: 'CASA_CLUB',
        color: '#0EA5E9',
        icon: 'home-modern',
    };

    const casaClubTypes = [
        { name: 'ACCESO_PERMITIDO', value: 'Acceso Permitido' },
        { name: 'ACCESO_INDEVIDO', value: 'Acceso Indebido' },
        { name: 'INGRESO_DE_BEBIDAS/TERMOS_', value: 'Ingreso de Bebidas/Termos' },
    ];

    // Upsert de la categoría CASA_CLUB al discriminador propio.
    let category = await prisma.incidentCategory.findUnique({
        where: { name: casaClubCategory.name },
        select: { id: true },
    });

    if (category) {
        await prisma.incidentCategory.update({
            where: { id: category.id },
            data: {
                value: casaClubCategory.value,
                type: casaClubCategory.type,
                color: casaClubCategory.color,
                icon: casaClubCategory.icon,
            },
        });
    } else {
        category = await prisma.incidentCategory.create({
            data: casaClubCategory,
            select: { id: true },
        });
    }

    for (const type of casaClubTypes) {
        const existingType = await prisma.incidentType.findUnique({
            where: { name: type.name },
            select: { id: true },
        });

        if (existingType) {
            await prisma.incidentType.update({
                where: { id: existingType.id },
                data: { value: type.value, categoryId: category.id },
            });
        } else {
            await prisma.incidentType.create({
                data: { name: type.name, value: type.value, categoryId: category.id },
            });
        }
    }

    hackerLog.success('SEED', 'Casa Club Catalogs populated');
};
