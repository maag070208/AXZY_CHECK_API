-- Índices para capacidad 500: usuarios por propiedad y listado de propiedades activas.
CREATE INDEX "User_propertyId_idx" ON "User"("propertyId");
CREATE INDEX "Property_softDelete_active_idx" ON "Property"("softDelete", "active");
