import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/.svelte-kit/**',
      'tests/e2e/playwright-report/**',
      // Local-only trees that are not part of the repo: `design/` holds the
      // design handoffs (gitignored) and `tools/` the throwaway migration
      // helpers (git/info/exclude). CI never sees either, so linting them only
      // ever reddens the local gate.
      'design/**',
      'tools/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // No `any`: unknown only at JSON parse boundaries (see CLAUDE.md).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // `.svelte` components and `.svelte.ts/.js` rune modules are parsed by
    // svelte-eslint-parser, which needs the TS parser for their <script>/TS body.
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
);
