/**
 * Development seed: demo tenants, agencies, users, zones, poles and devices.
 *
 *   npm run seed -w @smart-light/db            (or: npx prisma migrate reset)
 *
 * Refuses to run in production. Production accounts are created with
 * `npm run bootstrap:admin -w @smart-light/db`.
 */
import 'dotenv/config';
import { formatPoleCode } from '@smart-light/shared';
import { createPrismaClient, type LightStatus, type Prisma } from '../src';
import { hashPassword } from '../src/security/password';

if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is not set (copy packages/db/.env.example to .env).');
  process.exit(1);
}

/** Demo-only password for every seeded account. */
const DEMO_PASSWORD = process.env['SEED_PASSWORD'] ?? 'SmartLight@2026';

const prisma = createPrismaClient(databaseUrl);

/** Deterministic pseudo-random numbers so every seed produces the same city. */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const INDORE_ZONES = [
  { code: 'Z01', name: 'Vijay Nagar', lat: 22.7533, lng: 75.8937 },
  { code: 'Z02', name: 'Palasia', lat: 22.7244, lng: 75.8839 },
  { code: 'Z03', name: 'Rajwada', lat: 22.7186, lng: 75.8547 },
  { code: 'Z04', name: 'Bhawarkuan', lat: 22.6926, lng: 75.8673 },
  { code: 'Z05', name: 'Sudama Nagar', lat: 22.699, lng: 75.832 },
];

const POLES_PER_ZONE = 12;

async function main(): Promise<void> {
  if ((await prisma.tenant.count()) > 0) {
    console.log('Database already seeded — run `npx prisma migrate reset` to start over.');
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const random = createRandom(42);

  const indore = await prisma.tenant.create({
    data: {
      slug: 'indore-mc',
      code: 'IND',
      name: 'Indore Municipal Corporation',
      nameHi: 'इंदौर नगर निगम',
      status: 'ACTIVE',
    },
  });
  const delhi = await prisma.tenant.create({
    data: {
      slug: 'delhi-mc',
      code: 'DEL',
      name: 'Municipal Corporation of Delhi',
      nameHi: 'दिल्ली नगर निगम',
      status: 'ONBOARDING',
    },
  });

  const municipalAgency = await prisma.agency.create({
    data: { tenantId: indore.id, name: 'IMC Electrical Department', type: 'MUNICIPAL' },
  });
  const contractorAgency = await prisma.agency.create({
    data: {
      tenantId: indore.id,
      name: 'Prakash Electricals (Contractor)',
      type: 'CONTRACTOR',
      contactPhone: '+919800000001',
    },
  });

  const users: Omit<Prisma.UserCreateManyInput, 'passwordHash'>[] = [
    { role: 'SUPER_ADMIN', name: 'Platform Admin', email: 'superadmin@smartlight.local' },
    {
      role: 'MUNICIPAL_ADMIN',
      name: 'Indore Admin',
      email: 'admin@indore.smartlight.local',
      tenantId: indore.id,
    },
    {
      role: 'SUPERVISOR',
      name: 'Rakesh Verma (JE)',
      email: 'supervisor@indore.smartlight.local',
      tenantId: indore.id,
    },
    {
      role: 'OPERATOR',
      name: 'Control Room Operator',
      email: 'operator@indore.smartlight.local',
      tenantId: indore.id,
    },
    {
      role: 'AGENCY_MANAGER',
      name: 'Prakash Electricals Manager',
      email: 'manager@prakash.smartlight.local',
      tenantId: indore.id,
      agencyId: contractorAgency.id,
    },
    {
      role: 'TECHNICIAN',
      name: 'Suresh Yadav',
      email: 'tech1@indore.smartlight.local',
      phone: '+919800000011',
      tenantId: indore.id,
      agencyId: municipalAgency.id,
    },
    {
      role: 'TECHNICIAN',
      name: 'Imran Khan',
      email: 'tech2@prakash.smartlight.local',
      phone: '+919800000012',
      tenantId: indore.id,
      agencyId: contractorAgency.id,
    },
    {
      role: 'MUNICIPAL_ADMIN',
      name: 'Delhi Admin',
      email: 'admin@delhi.smartlight.local',
      tenantId: delhi.id,
    },
  ];
  await prisma.user.createMany({ data: users.map((user) => ({ ...user, passwordHash })) });

  let serial = 0;
  for (const zoneSpec of INDORE_ZONES) {
    const zone = await prisma.zone.create({
      data: { tenantId: indore.id, code: zoneSpec.code, name: zoneSpec.name },
    });

    for (let index = 0; index < POLES_PER_ZONE; index++) {
      serial++;
      const roll = random();
      const lightStatus: LightStatus =
        roll < 0.78 ? 'ON' : roll < 0.86 ? 'DIMMED' : roll < 0.93 ? 'FAULT' : 'OFFLINE';
      const hasController = random() < 0.75;

      await prisma.pole.create({
        data: {
          tenantId: indore.id,
          zoneId: zone.id,
          serial,
          code: formatPoleCode(indore.code, serial),
          latitude: zoneSpec.lat + (random() - 0.5) * 0.012,
          longitude: zoneSpec.lng + (random() - 0.5) * 0.012,
          address: `${zoneSpec.name}, Indore`,
          ward: `Ward ${10 + Math.floor(random() * 20)}`,
          lampType: 'LED',
          wattage: random() < 0.5 ? 90 : 120,
          installedAt: new Date(Date.UTC(2025, Math.floor(random() * 12), 1)),
          lightStatus: hasController ? lightStatus : 'UNKNOWN',
          lightStatusAt: hasController ? new Date() : null,
          ...(hasController
            ? {
                device: {
                  create: {
                    tenantId: indore.id,
                    deviceId: `sl-${String(serial).padStart(6, '0')}`,
                    firmwareVersion: '0.1.0',
                    online: lightStatus !== 'OFFLINE',
                    lastSeenAt: new Date(),
                  },
                },
              }
            : {}),
        },
      });
    }
  }
  await prisma.tenantCounter.create({
    data: { tenantId: indore.id, name: 'pole', value: serial },
  });

  console.log(`Seeded 2 tenants, 2 agencies, ${users.length} users, ${serial} poles.`);
  console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
