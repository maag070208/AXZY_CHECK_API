import { PrismaClient } from "@prisma/client";

export const locationsSeed = async (prisma: PrismaClient) => {
  const locations = [
    // 🏠 ACCESOS / GENERALES
    { name: "Acceso Principal", aisle: "GENERAL", spot: "ENTRADA", number: "1" },
    { name: "Caseta de Vigilancia", aisle: "GENERAL", spot: "SEGURIDAD", number: "2" },
    { name: "Barda Perimetral Norte", aisle: "GENERAL", spot: "BARDA", number: "3" },
    { name: "Barda Perimetral Sur", aisle: "GENERAL", spot: "BARDA", number: "4" },
    { name: "Barda Perimetral Este", aisle: "GENERAL", spot: "BARDA", number: "5" },
    { name: "Barda Perimetral Oeste", aisle: "GENERAL", spot: "BARDA", number: "6" },

    // 🌳 ÁREAS VERDES
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `Jardín ${i + 1}`,
      aisle: "AREAS_VERDES",
      spot: "JARDIN",
      number: `${i + 1}`,
    })),

    // 🛝 PARQUES
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `Parque ${i + 1}`,
      aisle: "RECREACION",
      spot: "PARQUE",
      number: `${i + 1}`,
    })),

    // 🏊 PISCINA
    { name: "Piscina Principal", aisle: "AMENIDADES", spot: "PISCINA", number: "1" },
    { name: "Piscina Infantil", aisle: "AMENIDADES", spot: "PISCINA", number: "2" },

    // 🏋️ AMENIDADES
    { name: "Gimnasio", aisle: "AMENIDADES", spot: "GYM", number: "1" },
    { name: "Salón de Eventos", aisle: "AMENIDADES", spot: "SALON", number: "1" },
    { name: "Área de Asadores", aisle: "AMENIDADES", spot: "ASADOR", number: "1" },
    { name: "Cancha de Futbol", aisle: "AMENIDADES", spot: "CANCHA", number: "1" },
    { name: "Cancha de Básquet", aisle: "AMENIDADES", spot: "CANCHA", number: "2" },

    // 🚗 ESTACIONAMIENTOS (40)
    ...Array.from({ length: 40 }, (_, i) => ({
      name: `Estacionamiento ${i + 1}`,
      aisle: "PARKING",
      spot: "AUTO",
      number: `${i + 1}`,
    })),

    // 🚶 CALLES / PRIVADAS (20)
    ...Array.from({ length: 20 }, (_, i) => ({
      name: `Calle ${String.fromCharCode(65 + i)}`,
      aisle: "VIALIDAD",
      spot: "CALLE",
      number: `${i + 1}`,
    })),

    // 🔧 SERVICIOS / TÉCNICOS
    { name: "Cuarto de Máquinas", aisle: "SERVICIO", spot: "MAQUINAS", number: "1" },
    { name: "Planta de Luz", aisle: "SERVICIO", spot: "ENERGIA", number: "2" },
    { name: "Área de Basura", aisle: "SERVICIO", spot: "BASURA", number: "3" },
    { name: "Cisterna", aisle: "SERVICIO", spot: "AGUA", number: "4" },
    { name: "Oficina Administración", aisle: "SERVICIO", spot: "ADMIN", number: "5" },

    // 🐶 EXTRAS
    { name: "Parque para Mascotas", aisle: "RECREACION", spot: "MASCOTAS", number: "1" },
    { name: "Zona de Juegos Infantiles", aisle: "RECREACION", spot: "JUEGOS", number: "2" },

    // 🔁 COMPLETAR HASTA 100 (extras genéricos útiles)
    ...Array.from({ length: 10 }, (_, i) => ({
      name: `Área Común ${i + 1}`,
      aisle: "COMUN",
      spot: "GENERAL",
      number: `${i + 1}`,
    })),
  ];

  for (const location of locations) {
    const exists = await prisma.location.findFirst({
      where: { name: location.name },
    });

    if (!exists) {
      await prisma.location.create({
        data: {
          ...location,
          isOccupied: false,
        },
      });
    }
  }
};