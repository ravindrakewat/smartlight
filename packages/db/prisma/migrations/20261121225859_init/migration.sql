-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgencyType" AS ENUM ('MUNICIPAL', 'CONTRACTOR');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'MUNICIPAL_ADMIN', 'SUPERVISOR', 'OPERATOR', 'AGENCY_MANAGER', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "LightStatus" AS ENUM ('UNKNOWN', 'ON', 'DIMMED', 'OFF', 'FAULT', 'OFFLINE');

-- CreateEnum
CREATE TYPE "ComplaintCategory" AS ENUM ('LIGHT_OFF', 'FLICKERING', 'DAY_BURNING', 'DAMAGED_POLE', 'EXPOSED_WIRING', 'OTHER');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ComplaintSource" AS ENUM ('WEB', 'MOBILE', 'SMS', 'WHATSAPP', 'CALL_CENTRE');

-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_VERIFICATION', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkOrderSource" AS ENUM ('IOT_ALERT', 'CITIZEN_COMPLAINT', 'INSPECTION', 'MANUAL');

-- CreateEnum
CREATE TYPE "WorkOrderPriority" AS ENUM ('CRITICAL', 'HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('IOT_TELEMETRY', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "WorkOrderEventType" AS ENUM ('CREATED', 'ASSIGNED', 'STARTED', 'COMPLETED', 'VERIFIED', 'VERIFICATION_FAILED', 'REOPENED', 'CANCELLED', 'COMMENT', 'SLA_BREACHED');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'CITIZEN', 'SYSTEM', 'DEVICE');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "code" VARCHAR(3) NOT NULL,
    "name" TEXT NOT NULL,
    "nameHi" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ONBOARDING',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "slaHours" INTEGER NOT NULL DEFAULT 24,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_counters" (
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tenant_counters_pkey" PRIMARY KEY ("tenantId","name")
);

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AgencyType" NOT NULL,
    "contactPhone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "agencyId" UUID,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "client" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "rotatedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "citizens" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMPTZ(3),

    CONSTRAINT "citizens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "zoneId" UUID,
    "code" TEXT NOT NULL,
    "serial" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "ward" TEXT,
    "lampType" TEXT,
    "wattage" INTEGER,
    "installedAt" TIMESTAMPTZ(3),
    "assetStatus" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "lightStatus" "LightStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lightStatusAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "poles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "poleId" UUID,
    "deviceId" TEXT NOT NULL,
    "serialNumber" TEXT,
    "firmwareVersion" TEXT,
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "poleId" UUID,
    "citizenId" UUID,
    "workOrderId" UUID,
    "category" "ComplaintCategory" NOT NULL,
    "description" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'SUBMITTED',
    "source" "ComplaintSource" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "photoUrl" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_orders" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "poleId" UUID NOT NULL,
    "source" "WorkOrderSource" NOT NULL,
    "priority" "WorkOrderPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'OPEN',
    "faultType" TEXT,
    "description" TEXT,
    "assignedAgencyId" UUID,
    "assignedTechnicianId" UUID,
    "createdById" UUID,
    "slaDueAt" TIMESTAMPTZ(3) NOT NULL,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "verificationMethod" "VerificationMethod",
    "resolutionCode" TEXT,
    "resolutionNotes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_events" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "type" "WorkOrderEventType" NOT NULL,
    "actorUserId" UUID,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_order_photos" (
    "id" UUID NOT NULL,
    "workOrderId" UUID NOT NULL,
    "kind" "PhotoKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "takenAt" TIMESTAMPTZ(3) NOT NULL,
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_order_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_code_key" ON "tenants"("code");

-- CreateIndex
CREATE INDEX "agencies_tenantId_idx" ON "agencies"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "agencies_tenantId_name_key" ON "agencies"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE INDEX "users_agencyId_idx" ON "users"("agencyId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "citizens_phone_key" ON "citizens"("phone");

-- CreateIndex
CREATE INDEX "otp_challenges_phone_createdAt_idx" ON "otp_challenges"("phone", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "zones_tenantId_code_key" ON "zones"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "poles_code_key" ON "poles"("code");

-- CreateIndex
CREATE INDEX "poles_tenantId_zoneId_idx" ON "poles"("tenantId", "zoneId");

-- CreateIndex
CREATE INDEX "poles_tenantId_lightStatus_idx" ON "poles"("tenantId", "lightStatus");

-- CreateIndex
CREATE INDEX "poles_tenantId_latitude_longitude_idx" ON "poles"("tenantId", "latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "poles_tenantId_serial_key" ON "poles"("tenantId", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "devices_poleId_key" ON "devices"("poleId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceId_key" ON "devices"("deviceId");

-- CreateIndex
CREATE INDEX "devices_tenantId_idx" ON "devices"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_number_key" ON "complaints"("number");

-- CreateIndex
CREATE INDEX "complaints_tenantId_status_createdAt_idx" ON "complaints"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "complaints_poleId_idx" ON "complaints"("poleId");

-- CreateIndex
CREATE INDEX "complaints_citizenId_idx" ON "complaints"("citizenId");

-- CreateIndex
CREATE UNIQUE INDEX "work_orders_number_key" ON "work_orders"("number");

-- CreateIndex
CREATE INDEX "work_orders_tenantId_status_slaDueAt_idx" ON "work_orders"("tenantId", "status", "slaDueAt");

-- CreateIndex
CREATE INDEX "work_orders_assignedTechnicianId_status_idx" ON "work_orders"("assignedTechnicianId", "status");

-- CreateIndex
CREATE INDEX "work_orders_assignedAgencyId_status_idx" ON "work_orders"("assignedAgencyId", "status");

-- CreateIndex
CREATE INDEX "work_orders_poleId_status_idx" ON "work_orders"("poleId", "status");

-- CreateIndex
CREATE INDEX "work_order_events_workOrderId_createdAt_idx" ON "work_order_events"("workOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "work_order_photos_workOrderId_idx" ON "work_order_photos"("workOrderId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "tenant_counters" ADD CONSTRAINT "tenant_counters_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poles" ADD CONSTRAINT "poles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poles" ADD CONSTRAINT "poles_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "poles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "poles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_citizenId_fkey" FOREIGN KEY ("citizenId") REFERENCES "citizens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_poleId_fkey" FOREIGN KEY ("poleId") REFERENCES "poles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedAgencyId_fkey" FOREIGN KEY ("assignedAgencyId") REFERENCES "agencies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assignedTechnicianId_fkey" FOREIGN KEY ("assignedTechnicianId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit trail is append-only: block UPDATE and DELETE at the database level,
-- so neither application bugs nor direct SQL can rewrite history.
CREATE OR REPLACE FUNCTION audit_logs_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_block_mutation();

-- Work-order timeline is immutable as well (rows are only removed with their work order).
CREATE OR REPLACE FUNCTION work_order_events_block_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'work_order_events is immutable (UPDATE not allowed)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_order_events_no_update
  BEFORE UPDATE ON "work_order_events"
  FOR EACH ROW EXECUTE FUNCTION work_order_events_block_update();
