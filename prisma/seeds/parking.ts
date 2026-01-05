import { PrismaClient, EntryStatus, MovementStatus, ExitStatus } from "@prisma/client";

export const parkingSeed = async (prisma: PrismaClient) => {
  console.log("Cleaning parking data...");
  await prisma.keyAssignment.deleteMany();
  await prisma.vehicleMovement.deleteMany();
  await prisma.vehicleExit.deleteMany();
  await prisma.vehiclePhoto.deleteMany();
  await prisma.vehicleEntry.deleteMany();
  await prisma.location.updateMany({ data: { isOccupied: false } });

  console.log("Parking data cleaned. Skipping seeding of new vehicle data as requested.");
  return; 

  /*
  console.log("Seeding parking data...");

  // Ensure users exist (from security seed)
// ... (rest of the file content commented out or unreachable due to return)
  console.log("Parking data seeded.");
  */
};
