import { createBaseConfig } from '@smart-light/config/eslint';

export default createBaseConfig([
  {
    group: ['@smart-light/ui', '@smart-light/ui/*'],
    message: '@smart-light/shared must remain UI-agnostic and runtime-agnostic.',
  },
]);
