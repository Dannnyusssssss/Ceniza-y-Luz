import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    // La lógica pura no puede depender del motor gráfico, del DOM ni del almacenamiento.
    files: ['src/game/**/*.ts', 'src/world/**/*.ts', 'src/core/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@babylonjs/*'], message: 'La lógica pura no importa el motor gráfico.' }] },
      ],
    },
  },
  {
    files: ['src/game/**/*.ts', 'src/world/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'document', 'window', 'localStorage', 'sessionStorage'],
    },
  },
  prettier,
);
