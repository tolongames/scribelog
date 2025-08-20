import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default [
  // Ignorowane ścieżki (zastępuje .eslintignore)
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**'],
  },

  // Rekomendowane reguły TypeScript ESLint (flat config)
  ...tseslint.configs.recommended,

  // Ustawienia globalne + podstawowe reguły
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      // Zmień "any" z błędu na ostrzeżenie (nie blokuje CI)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
    },
  },

  // Testy: pozwól na require, any, Function-typy i luźne wyrażenia
  {
    files: ['test/**/*.ts', '*.test.ts', '*.spec.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
    },
  },

  // Źródła z "lazy require" (pozwól na require w tych plikach)
  {
    files: ['src/transports/mongodb.ts', 'src/transports/websocket.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
    },
  },

  // Integracja z Prettier (formatowanie)
  prettierRecommended,
];
