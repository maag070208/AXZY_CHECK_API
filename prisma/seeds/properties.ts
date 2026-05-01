import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hackerLog } from "./logger";

export const propertiesSeed = async (prisma: PrismaClient) => {
  const password = await bcrypt.hash("123123", 10);
  hackerLog.info("PROPERTY", "Initializing Property Catalog");

  const casaType = await prisma.propertyType.findUnique({ where: { name: "CASA" } });
  const vacantStatus = await prisma.propertyStatus.findUnique({ where: { name: "VACNT" } });
  const inhabitedStatus = await prisma.propertyStatus.findUnique({ where: { name: "HABIT" } });
  const residentRole = await prisma.role.findUnique({ where: { name: "RESDN" } });

  if (!casaType || !vacantStatus || !inhabitedStatus || !residentRole) {
    hackerLog.error("PROPERTY", "Catalogs/Roles not found, seed them first");
    return;
  }

  hackerLog.info("PROPERTY", "Creating 100 real-like properties");

  // 🔥 Calles realistas (puedes ajustar luego si quieres exactitud total con Google Maps API)
  const streets = [
    "Calle Aries",
    "Calle Tauro",
    "Calle Géminis",
    "Calle Cáncer",
    "Calle Leo",
    "Calle Virgo",
    "Calle Libra",
    "Calle Escorpio",
    "Calle Sagitario",
    "Calle Capricornio",
    "Calle Acuario",
    "Calle Piscis",
    "Av. De los Astros",
    "Av. Constelación",
    "Av. Vía Láctea",
    "Calle Eclipse",
    "Calle Cometa",
    "Calle Nebulosa",
    "Calle Galaxia",
    "Calle Universo",
  ];

  const properties = [];

  const propertiesData = Array.from({ length: 100 }).map((_, i) => {
    const street = streets[i % streets.length];
    const number = (100 + i).toString();

    return {
      identifier: `CASA-${(i + 1).toString().padStart(3, "0")}`,
      name: `Casa ${i + 1} Horóscopo`,
      typeId: casaType.id,
      statusId: vacantStatus.id,
      mainStreet: `${street} #${number}`,
      betweenStreets: "Av. De los Planetas y Calle Estrella",
      latitude: 32.46 + Math.random() * 0.02,
      longitude: -116.92 + Math.random() * 0.02,
    };
  });

  for (const prop of propertiesData) {
    properties.push(
      await prisma.property.upsert({
        where: { identifier: prop.identifier },
        update: {},
        create: prop,
      })
    );
  }

  hackerLog.info("PROPERTY", "Assigning residents");

  const resNames = ["Roberto", "Maria", "Carlos", "Fernanda", "Luis", "Ana", "Jose", "Laura"];
  const lastNames = ["Gomez", "Lopez", "Martinez", "Gonzalez", "Rodriguez", "Perez", "Sanchez", "Ramirez"];

  for (let i = 0; i < 20; i++) {
    const username = `residente${i + 1}`;

    await prisma.user.upsert({
      where: { username },
      update: {
        propertyId: properties[i].id,
        roleId: residentRole.id,
      },
      create: {
        name: resNames[i % resNames.length],
        lastName: lastNames[i % lastNames.length],
        username,
        password,
        roleId: residentRole.id,
        propertyId: properties[i].id,
        residentProfile: {
          create: {
            firstName: resNames[i % resNames.length],
            fatherLastName: lastNames[i % lastNames.length],
            phoneNumber: `664000${i}${i}${i}${i}`,
            email: `${username}@correo.com`,
            emergencyContact: `Emergencia ${resNames[i % resNames.length]}`,
            emergencyPhone: `664999${i}${i}${i}${i}`,
          },
        },
      },
    });

    await prisma.property.update({
      where: { id: properties[i].id },
      data: { statusId: inhabitedStatus.id },
    });
  }

  hackerLog.success("PROPERTY", "100 properties ready 🚀");
};