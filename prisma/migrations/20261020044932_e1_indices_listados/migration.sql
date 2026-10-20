-- CreateIndex
CREATE INDEX "Incident_kind_status_createdAt_idx" ON "Incident"("kind", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Invitation_propertyId_status_idx" ON "Invitation"("propertyId", "status");

-- CreateIndex
CREATE INDEX "Kardex_userId_timestamp_idx" ON "Kardex"("userId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "Maintenance_status_createdAt_idx" ON "Maintenance"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Property_statusId_typeId_idx" ON "Property"("statusId", "typeId");

-- CreateIndex
CREATE INDEX "RecurringLocation_configurationId_idx" ON "RecurringLocation"("configurationId");

-- CreateIndex
CREATE INDEX "Round_guardId_status_idx" ON "Round"("guardId", "status");

-- CreateIndex
CREATE INDEX "Round_recurringConfigurationId_status_idx" ON "Round"("recurringConfigurationId", "status");

-- CreateIndex
CREATE INDEX "Round_startTime_idx" ON "Round"("startTime" DESC);

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "User_isLoggedIn_idx" ON "User"("isLoggedIn");
