import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import ember from 'eslint-plugin-ember/recommended';
import ts from 'typescript-eslint';
import globals from 'globals';

const tsParserOptions = {
  projectService: true,
  tsconfigRootDir: import.meta.dirname,
};

export default defineConfig([
  globalIgnores(['node_modules/', '.vitepress/cache/', '.vitepress/dist/']),
  js.configs.recommended,
  prettier,
  ember.configs.base,
  ember.configs.gjs,
  ember.configs.gts,
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.{js,gjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: tsParserOptions,
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.{ts,gts}'],
    languageOptions: {
      parser: ember.parser,
      parserOptions: tsParserOptions,
      globals: {
        ...globals.browser,
      },
    },
    extends: [
      ...ts.configs.recommendedTypeChecked,
      {
        ...ts.configs.eslintRecommended,
        files: undefined,
      },
      ember.configs.gts,
    ],
  },
  {
    files: ['.vitepress/**/*.ts'],
    languageOptions: {
      parserOptions: tsParserOptions,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    extends: [...ts.configs.recommended],
  },
  /**
   * Relax rules for demo files
   */
  {
    files: ['demos/**/*.{gjs,gts}'],
    rules: {
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
]);
