-- CreateTable
CREATE TABLE "UniformCheck" (
    "id" SERIAL NOT NULL,
    "guardId" INTEGER NOT NULL,
    "evaluatedById" INTEGER NOT NULL,
    "pantalon" BOOLEAN NOT NULL DEFAULT false,
    "botas" BOOLEAN NOT NULL DEFAULT false,
    "cinturon" BOOLEAN NOT NULL DEFAULT false,
    "camisa" BOOLEAN NOT NULL DEFAULT false,
    "pluma" BOOLEAN NOT NULL DEFAULT false,
    "gorra" BOOLEAN NOT NULL DEFAULT false,
    "unas" BOOLEAN NOT NULL DEFAULT false,
    "orejas" BOOLEAN NOT NULL DEFAULT false,
    "desodorante" BOOLEAN NOT NULL DEFAULT false,
    "afeitado" BOOLEAN NOT NULL DEFAULT false,
    "peinado" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniformCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UniformCheck_createdAt_idx" ON "UniformCheck"("createdAt");

-- CreateIndex
CREATE INDEX "UniformCheck_guardId_idx" ON "UniformCheck"("guardId");

-- AddForeignKey
ALTER TABLE "UniformCheck" ADD CONSTRAINT "UniformCheck_guardId_fkey" FOREIGN KEY ("guardId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UniformCheck" ADD CONSTRAINT "UniformCheck_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
