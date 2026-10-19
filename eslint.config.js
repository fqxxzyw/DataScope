import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
export default ts.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'release/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  { files: ['**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  {
    files: ['**/*.{ts,tsx,js,cjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node, ...globals.worker } },
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
