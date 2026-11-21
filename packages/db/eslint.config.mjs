import { createNodeConfig } from '@smart-light/config/eslint';

export default [{ ignores: ['src/generated/**', '.pgdata/**'] }, ...createNodeConfig()];
