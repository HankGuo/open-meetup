import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.logs/**', '**/coverage/**', 'server/uploads/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['**/*.cjs', 'server/test/**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['server/**/*.ts', 'scripts/**/*.cjs', '*.cjs', 'server/test/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['client/**/*.ts', 'client/**/*.tsx'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
];
