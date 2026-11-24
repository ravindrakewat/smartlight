-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totpEnabledAt" TIMESTAMPTZ(3),
ADD COLUMN     "totpLastStep" INTEGER;

-- CreateTable
CREATE TABLE "mfa_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mfa_challenges_tokenHash_key" ON "mfa_challenges"("tokenHash");

-- CreateIndex
CREATE INDEX "mfa_challenges_userId_idx" ON "mfa_challenges"("userId");

-- CreateIndex
CREATE INDEX "mfa_recovery_codes_userId_idx" ON "mfa_recovery_codes"("userId");

-- AddForeignKey
ALTER TABLE "mfa_challenges" ADD CONSTRAINT "mfa_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
