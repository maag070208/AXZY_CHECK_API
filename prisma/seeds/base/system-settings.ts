import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

/**
 * Ajustes del sistema (iguales en todas las instalaciones). Se crean si faltan;
 * no sobrescriben lo que un administrador haya cambiado.
 */
export const systemSettingsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('SYSTEM', 'Deploying system settings');

    const settings = [
        { key: 'APP_VERSION', valueType: 'string', value: '1.0.0', group: 'general' },
        { key: 'MAINTENANCE_MODE', valueType: 'bool', value: 'false', group: 'general' },
    ];

    for (const setting of settings) {
        await prisma.appSetting.upsert({
            where: { key: setting.key },
            update: {},
            create: setting,
        });
    }

    hackerLog.success('SYSTEM', 'System settings configured');
};
