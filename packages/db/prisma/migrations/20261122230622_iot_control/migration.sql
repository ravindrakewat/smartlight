-- CreateEnum
CREATE TYPE "DeviceCommandStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "appliedScheduleId" TEXT,
ADD COLUMN     "dimPercent" INTEGER,
ADD COLUMN     "lampOn" BOOLEAN,
ADD COLUMN     "lastTelemetry" JSONB,
ADD COLUMN     "lastTelemetryAt" TIMESTAMPTZ(3),
ADD COLUMN     "mode" TEXT,
ADD COLUMN     "resetReason" TEXT;

-- AlterTable
ALTER TABLE "zones" ADD COLUMN     "scheduleId" UUID;

-- CreateTable
CREATE TABLE "device_readings" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceTs" INTEGER NOT NULL,
    "lampOn" BOOLEAN NOT NULL,
    "dimPercent" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "voltageV" DOUBLE PRECISION NOT NULL,
    "currentA" DOUBLE PRECISION NOT NULL,
    "powerW" DOUBLE PRECISION NOT NULL,
    "energyWh" DOUBLE PRECISION NOT NULL,
    "rssiDbm" INTEGER NOT NULL,
    "boardTempC" DOUBLE PRECISION,
    "motion" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "device_readings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "poleId" UUID,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "clears" TEXT,
    "message" TEXT,
    "snapshot" JSONB,
    "deviceTs" INTEGER NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workOrderId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_commands" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "DeviceCommandStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),
    "ackAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "device_readings_deviceId_receivedAt_idx" ON "device_readings"("deviceId", "receivedAt");

-- CreateIndex
CREATE INDEX "device_readings_tenantId_receivedAt_idx" ON "device_readings"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "device_events_tenantId_receivedAt_idx" ON "device_events"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "device_events_deviceId_type_resolvedAt_idx" ON "device_events"("deviceId", "type", "resolvedAt");

-- CreateIndex
CREATE INDEX "device_commands_status_createdAt_idx" ON "device_commands"("status", "createdAt");

-- CreateIndex
CREATE INDEX "device_commands_deviceId_createdAt_idx" ON "device_commands"("deviceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_tenantId_name_key" ON "schedules"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_readings" ADD CONSTRAINT "device_readings_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_events" ADD CONSTRAINT "device_events_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_commands" ADD CONSTRAINT "device_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
