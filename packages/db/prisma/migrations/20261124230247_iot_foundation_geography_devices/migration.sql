-- CreateEnum
CREATE TYPE "DeviceInstallStatus" AS ENUM ('IN_STOCK', 'INSTALLED', 'REMOVED', 'FAULTY');

-- CreateEnum
CREATE TYPE "CommInterfaceKind" AS ENUM ('WIFI', 'CELLULAR', 'LORAWAN');

-- AlterTable
ALTER TABLE "device_commands" ADD COLUMN     "appliedAt" TIMESTAMPTZ(3),
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'mqtt',
ADD COLUMN     "downlinkId" TEXT;

-- AlterTable
ALTER TABLE "device_readings" ADD COLUMN     "snrDb" DOUBLE PRECISION,
ADD COLUMN     "via" TEXT;

-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "hardwareVersion" TEXT,
ADD COLUMN     "installStatus" "DeviceInstallStatus" NOT NULL DEFAULT 'INSTALLED',
ADD COLUMN     "isSimulated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "poles" ADD COLUMN     "streetId" UUID,
ADD COLUMN     "wardId" UUID;

-- CreateTable
CREATE TABLE "wards" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "zoneId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "streets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "wardId" UUID,
    "zoneId" UUID,
    "name" TEXT NOT NULL,
    "nameHi" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "streets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_interfaces" (
    "id" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "kind" "CommInterfaceKind" NOT NULL,
    "identifier" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "lastSeenAt" TIMESTAMPTZ(3),
    "lastRssiDbm" INTEGER,
    "lastSnrDb" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "device_interfaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lorawan_devices" (
    "id" UUID NOT NULL,
    "interfaceId" UUID NOT NULL,
    "devEui" TEXT NOT NULL,
    "joinEui" TEXT NOT NULL,
    "appKeyEncrypted" TEXT,
    "deviceProfile" TEXT NOT NULL,
    "macVersion" TEXT NOT NULL DEFAULT '1.0.3',
    "region" TEXT NOT NULL DEFAULT 'IN865',
    "activation" TEXT NOT NULL DEFAULT 'OTAA',
    "deviceClass" TEXT NOT NULL DEFAULT 'A',
    "joinStatus" TEXT NOT NULL DEFAULT 'NOT_JOINED',
    "joinedAt" TIMESTAMPTZ(3),
    "lastFCntUp" INTEGER,
    "lastUplinkAt" TIMESTAMPTZ(3),
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lorawan_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gateways" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "network" TEXT NOT NULL DEFAULT 'LORAWAN',
    "gatewayEui" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "backhaul" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "altitudeM" DOUBLE PRECISION,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMPTZ(3),
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "gateways_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lorawan_uplinks" (
    "id" UUID NOT NULL,
    "deduplicationId" TEXT NOT NULL,
    "devEui" TEXT NOT NULL,
    "deviceId" UUID,
    "fCnt" INTEGER NOT NULL,
    "fPort" INTEGER,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL,
    "rssiDbm" INTEGER,
    "snrDb" DOUBLE PRECISION,
    "gatewayEui" TEXT,
    "gatewayCount" INTEGER NOT NULL DEFAULT 0,
    "dataRate" INTEGER,
    "frequencyHz" INTEGER,
    "payloadHex" TEXT,
    "result" TEXT NOT NULL,
    "isSimulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lorawan_uplinks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wards_zoneId_idx" ON "wards"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "wards_tenantId_code_key" ON "wards"("tenantId", "code");

-- CreateIndex
CREATE INDEX "streets_tenantId_name_idx" ON "streets"("tenantId", "name");

-- CreateIndex
CREATE INDEX "streets_wardId_idx" ON "streets"("wardId");

-- CreateIndex
CREATE UNIQUE INDEX "device_interfaces_kind_identifier_key" ON "device_interfaces"("kind", "identifier");

-- CreateIndex
CREATE UNIQUE INDEX "device_interfaces_deviceId_kind_key" ON "device_interfaces"("deviceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "lorawan_devices_interfaceId_key" ON "lorawan_devices"("interfaceId");

-- CreateIndex
CREATE UNIQUE INDEX "lorawan_devices_devEui_key" ON "lorawan_devices"("devEui");

-- CreateIndex
CREATE UNIQUE INDEX "gateways_gatewayEui_key" ON "gateways"("gatewayEui");

-- CreateIndex
CREATE INDEX "gateways_tenantId_idx" ON "gateways"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "lorawan_uplinks_deduplicationId_key" ON "lorawan_uplinks"("deduplicationId");

-- CreateIndex
CREATE INDEX "lorawan_uplinks_devEui_receivedAt_idx" ON "lorawan_uplinks"("devEui", "receivedAt");

-- CreateIndex
CREATE INDEX "poles_wardId_idx" ON "poles"("wardId");

-- CreateIndex
CREATE INDEX "poles_streetId_idx" ON "poles"("streetId");

-- AddForeignKey
ALTER TABLE "poles" ADD CONSTRAINT "poles_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poles" ADD CONSTRAINT "poles_streetId_fkey" FOREIGN KEY ("streetId") REFERENCES "streets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wards" ADD CONSTRAINT "wards_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streets" ADD CONSTRAINT "streets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streets" ADD CONSTRAINT "streets_wardId_fkey" FOREIGN KEY ("wardId") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "streets" ADD CONSTRAINT "streets_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_interfaces" ADD CONSTRAINT "device_interfaces_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lorawan_devices" ADD CONSTRAINT "lorawan_devices_interfaceId_fkey" FOREIGN KEY ("interfaceId") REFERENCES "device_interfaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gateways" ADD CONSTRAINT "gateways_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lorawan_uplinks" ADD CONSTRAINT "lorawan_uplinks_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
