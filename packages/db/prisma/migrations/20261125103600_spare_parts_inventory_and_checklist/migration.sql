-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('RECEIVED', 'USED', 'ADJUSTED');

-- AlterTable
ALTER TABLE "work_orders" ADD COLUMN     "checklist" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_parts" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "sparePartId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "sparePartId" UUID NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "workOrderId" UUID,
    "note" TEXT,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spare_parts_tenantId_code_key" ON "spare_parts"("tenantId", "code");

-- CreateIndex
CREATE INDEX "work_order_parts_workOrderId_idx" ON "work_order_parts"("workOrderId");

-- CreateIndex
CREATE INDEX "work_order_parts_sparePartId_createdAt_idx" ON "work_order_parts"("sparePartId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_sparePartId_createdAt_idx" ON "stock_movements"("sparePartId", "createdAt");

-- AddForeignKey
ALTER TABLE "spare_parts" ADD CONSTRAINT "spare_parts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_parts" ADD CONSTRAINT "work_order_parts_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sparePartId_fkey" FOREIGN KEY ("sparePartId") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
