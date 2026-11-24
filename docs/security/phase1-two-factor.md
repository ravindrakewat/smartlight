# Phase 1 — Admin two-factor sign-in and session security

Status: implemented and tested on branch `feat/phase1-admin-2fa`. **Not deployed.** Production
deployment needs the owner's approval.

## What changes

| Area | Change |
| --- | --- |
| Sign-in | After a correct password, an account with two-factor (or whose role requires it) gets a 5-minute, single-use challenge instead of a session. Completed with a 6-digit authenticator code (RFC 6238, ±30 s drift) or a one-time recovery code. |
| Who | Required for `SUPER_ADMIN` (env `MFA_REQUIRED_ROLES`). Optional for `MUNICIPAL_ADMIN` (Settings → Two-factor sign-in). Not offered to field and control-room roles; the mobile app is unaffected. |
| First sign-in of a required role | Enrolment inside the sign-in: QR code, manual key, confirm with a code, 10 recovery codes shown once. |
| Secrets | TOTP secret encrypted with AES-256-GCM (`MFA_ENCRYPTION_KEY`); recovery codes stored as HMAC-SHA-256 hashes; challenge tokens stored as SHA-256 hashes. |
| Replay | A code's 30-second step is never accepted twice. |
| Lockout | Wrong codes count with wrong passwords: 5 in a row lock the account for 15 minutes. One challenge allows 5 wrong codes. |
| Sessions | New: list signed-in devices, sign out every other device. Existing (verified): sessions checked on every request, so logout, password reset, disabling a user and two-factor reset take effect immediately. |
| Recovery | Another platform administrator: `POST /api/v1/users/{id}/mfa-reset`. No other administrator: `npm run mfa:reset[:render] -w @smart-light/db` (needs database access; audited). |
| Audit | `auth.mfa_challenge`, `auth.mfa_failed`, `auth.account_locked`, `auth.mfa_enabled`, `auth.mfa_disabled`, `auth.mfa_recovery_code_used`, `auth.mfa_recovery_codes_regenerated`, `auth.sessions_revoked`, `user.mfa_reset`. |

## Database migration

`packages/db/prisma/migrations/20261124223017_admin_two_factor` — additive only:

- `users`: new nullable columns `totpEnabledAt`, `totpLastStep`.
- New tables `mfa_challenges`, `mfa_recovery_codes` (cascade on user delete).

No table, column or row is dropped or rewritten. The existing `users.totpSecret` and
`users.totpEnabled` columns (unused until now, all null/false) are reused.

## Deploy (after approval)

1. **Back up the database.** Render dashboard → `smart-light-db` → Backups → create a manual
   backup (or `pg_dump "$RENDER_EXTERNAL_DATABASE_URL" -Fc -f before-phase1.dump`).
2. **Set the new secret on the API service** (Render → `smart-light-api` → Environment):
   `MFA_ENCRYPTION_KEY` = output of `openssl rand -base64 32`. Keep a copy in the team's password
   manager; losing it means every admin re-enrols. Optionally `MFA_REQUIRED_ROLES=SUPER_ADMIN`
   (the default). The API refuses to start in production without the key.
3. **Apply the migration** from your machine: `npm run migrate:deploy -w @smart-light/db` with
   `DATABASE_URL` set to the external Render URL (as for earlier migrations).
4. **Merge the branch into `main` and push.** Render redeploys the API; Vercel redeploys the
   three web apps.
5. **First sign-in of each platform administrator** now asks them to enrol. Have the
   authenticator app ready and save the recovery codes.
6. Check: `GET /api/health/ready` is ok; sign in to the platform console with a code; Settings
   shows "On"; Audit log shows `auth.mfa_enabled`.

## Roll back

The code and the migration are independent: old code ignores the new columns and tables.

1. **Code only (preferred):** revert the merge commit on `main` and push. Admins sign in with a
   password again. The new tables stay, unused.
2. **Database (only if required):** after step 1, run:

   ```sql
   BEGIN;
   DROP TABLE IF EXISTS "mfa_recovery_codes";
   DROP TABLE IF EXISTS "mfa_challenges";
   ALTER TABLE "users" DROP COLUMN IF EXISTS "totpLastStep", DROP COLUMN IF EXISTS "totpEnabledAt";
   UPDATE "users" SET "totpSecret" = NULL, "totpEnabled" = false;
   DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261124223017_admin_two_factor';
   COMMIT;
   ```

3. Last resort: restore the backup from deploy step 1.

## Tests

- `apps/api/test/security.test.ts` (19): enrolment, encrypted storage, web cookies only after
  the second step, wrong / expired / replayed codes, expired and reused challenges, lockout,
  recovery codes, required role cannot disable, optional enrolment for municipal admins, not
  offered to technicians, sessions list and revoke, logout and expiry, admin reset, a role ×
  endpoint access matrix, citizens kept out of staff endpoints.
- `apps/api/test/totp.test.ts` (5): RFC 6238 test vectors, clock drift, replay, encryption
  tamper detection, recovery code format.
- Existing suites run through the same two-factor flow (the test helper enrols super admins).

Rate limits are switched off in automated tests (`NODE_ENV=test`), so they are verified by
configuration, not by a test.
