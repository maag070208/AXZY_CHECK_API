-- Fase 2A: avisos/comunicados de administración a residentes.
-- Rollback: ALTER TABLE "Notification" DROP CONSTRAINT "Notification_announcementId_fkey"; DROP INDEX "Notification_announcementId_idx"; ALTER TABLE "Notification" DROP COLUMN "announcementId"; DROP TABLE "Announcement"; DROP TYPE "AnnouncementAudience";
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL', 'PROPERTY', 'ROLE');

CREATE TABLE "Announcement" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "propertyId" INTEGER,
    "roleName" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Announcement_sentAt_idx" ON "Announcement"("sentAt");

ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD COLUMN "announcementId" INTEGER;
CREATE INDEX "Notification_announcementId_idx" ON "Notification"("announcementId");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
