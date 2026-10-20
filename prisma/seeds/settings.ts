import { PrismaClient } from "@prisma/client";
import { hackerLog } from "./logger";

/** Ajustes por defecto del cliente. Se pueden cambiar después con PUT /settings/:key. */
export const settingsSeed = async (prisma: PrismaClient) => {
    hackerLog.info('SYSTEM', 'Deploying System configurations');

    const settings = [
        { key: 'APP_VERSION', valueType: 'string', value: '1.0.0', group: 'general' },
        { key: 'MAINTENANCE_MODE', valueType: 'bool', value: 'false', group: 'general' },
        { key: 'INCIDENT_EMAIL', valueType: 'string', value: 'maag070208@gmail.com|asael070208@gmail.com', group: 'notificaciones' },
        { key: 'MAINTENANCE_EMAIL', valueType: 'string', value: 'maag070208@gmail.com|asael070208@gmail.com', group: 'notificaciones' },
    ];

    for (const setting of settings) {
        await prisma.appSetting.upsert({
            where: { key: setting.key },
            update: { value: setting.value },
            create: setting,
        });
    }

    hackerLog.success('SYSTEM', 'Core parameters configured');
};
