import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/generated/**',
      '**/.turbo/**',
      '**/.vite/**',
      '.corepack-cache/**',
      '.pnpm-store/**',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs,jsx}'],
    ...js.configs.recommended,
    languageOptions: {
      globals: globals.node,
    },
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,cts,mts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
