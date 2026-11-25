import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    env: {
      LOG_LEVEL: 'error',
      NODE_ENV: 'test',
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256-signing',
      CORS_ORIGINS: 'http://localhost:3000,http://localhost:3001,http://localhost:3002',
      API_DOCS_ENABLED: 'true',
      OTP_TEST_NUMBERS: '+919000000001:246810',
      CHIRPSTACK_APPLICATION_ID: '7d1c1b2e-3f4a-4b5c-8d6e-9f0a1b2c3d4e',
    },
  },
});
