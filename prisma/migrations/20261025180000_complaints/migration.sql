-- Tablas del buzón de quejas (módulo 13). Migración aditiva: no altera datos existentes.
-- Rollback: DROP TABLE "ComplaintEvent", "ComplaintMessage", "Complaint"; DROP TYPE "ComplaintStatus", "ComplaintCategory";
-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('MANTENIMIENTO', 'SEGURIDAD', 'RUIDO', 'LIMPIEZA', 'ADMINISTRACION', 'SUGERENCIA', 'OTRA');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('NEW', 'IN_REVIEW', 'WAITING_RESIDENT', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "Complaint" (
    "id" SERIAL NOT NULL,
    "propertyId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "assignedToId" INTEGER,
    "category" "ComplaintCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "media" JSONB,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'NEW',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintMessage" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplaintEvent" (
    "id" SERIAL NOT NULL,
    "complaintId" INTEGER NOT NULL,
    "fromStatus" "ComplaintStatus",
    "toStatus" "ComplaintStatus" NOT NULL,
    "byUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplaintEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Complaint_propertyId_createdAt_idx" ON "Complaint"("propertyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Complaint_status_createdAt_idx" ON "Complaint"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ComplaintMessage_complaintId_createdAt_idx" ON "ComplaintMessage"("complaintId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplaintEvent_complaintId_createdAt_idx" ON "ComplaintEvent"("complaintId", "createdAt");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMessage" ADD CONSTRAINT "ComplaintMessage_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintMessage" ADD CONSTRAINT "ComplaintMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "Complaint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplaintEvent" ADD CONSTRAINT "ComplaintEvent_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

