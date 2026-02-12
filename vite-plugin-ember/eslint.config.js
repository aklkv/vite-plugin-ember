import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import ts from 'typescript-eslint';
import globals from 'globals';

export default defineConfig([
  globalIgnores(['node_modules/', 'dist/']),
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.ts'],
    extends: [...ts.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]);
