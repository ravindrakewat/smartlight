import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettierConfig from 'eslint-config-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const CROSS_APP_IMPORT_PATTERNS = [
  {
    group: [
      '**/apps/*',
      '../api/*',
      '../citizen-web/*',
      '../municipal-admin/*',
      '../super-admin/*',
      '../mobile/*',
    ],
    message:
      'Direct cross-application imports are forbidden. Move shared contracts to @smart-light/shared or web UI primitives to @smart-light/ui.',
  },
];

export function createBaseConfig(extraRestrictedPatterns = []) {
  return tseslint.config(
    {
      ignores: [
        'dist/**',
        'build/**',
        '.next/**',
        '.expo/**',
        'node_modules/**',
        'coverage/**',
        'next-env.d.ts',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        'no-restricted-imports': [
          'error',
          {
            patterns: [...CROSS_APP_IMPORT_PATTERNS, ...extraRestrictedPatterns],
          },
        ],
      },
    },
    prettierConfig,
  );
}

export function createNodeConfig() {
  return tseslint.config(
    ...createBaseConfig([
      {
        group: ['@smart-light/ui', '@smart-light/ui/*'],
        message: '@smart-light/ui is web-only and cannot be imported in backend services.',
      },
    ]),
    {
      languageOptions: {
        globals: {
          ...globals.node,
        },
      },
    },
  );
}

export function createReactLibraryConfig() {
  return tseslint.config(
    ...createBaseConfig(),
    {
      plugins: {
        react: reactPlugin,
        'react-hooks': reactHooksPlugin,
      },
      languageOptions: {
        globals: {
          ...globals.browser,
        },
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        ...reactPlugin.configs.recommended.rules,
        ...reactPlugin.configs['jsx-runtime'].rules,
        ...reactHooksPlugin.configs.recommended.rules,
      },
    },
    prettierConfig,
  );
}

export function createNextConfig() {
  return tseslint.config(
    ...createReactLibraryConfig(),
    {
      plugins: {
        '@next/next': nextPlugin,
      },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    },
    prettierConfig,
  );
}

export function createMobileConfig() {
  return tseslint.config(
    ...createBaseConfig([
      {
        group: ['@smart-light/ui', '@smart-light/ui/*'],
        message:
          '@smart-light/ui is web-only. Use dedicated React Native components inside apps/mobile.',
      },
    ]),
    {
      plugins: {
        react: reactPlugin,
        'react-hooks': reactHooksPlugin,
      },
      languageOptions: {
        globals: {
          ...globals.browser,
          ...globals.node,
        },
      },
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        ...reactPlugin.configs.recommended.rules,
        ...reactPlugin.configs['jsx-runtime'].rules,
        ...reactHooksPlugin.configs.recommended.rules,
      },
    },
    prettierConfig,
  );
}
