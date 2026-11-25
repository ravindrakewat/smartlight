-- AlterTable
ALTER TABLE "device_commands" ADD COLUMN     "transmittedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "lorawan_devices" ADD COLUMN     "appKeyFingerprint" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "lorawan_devices_appKeyFingerprint_key" ON "lorawan_devices"("appKeyFingerprint");

