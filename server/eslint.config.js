import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      // The shared pino logger is the only sanctioned output channel.
      'no-console': ['error', { allow: ['error'] }],
      eqeqeq: ['error', 'smart'],
      'no-return-await': 'error',
    },
  },
  {
    // Env validation reports failures before the logger exists.
    files: ['src/config/env.ts'],
    rules: { 'no-console': 'off' },
  },
);
