// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import jestPlugin from 'eslint-plugin-jest';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      'coverage/',
      'node_modules/',
      'test/load/',
      'specs/',
      '.specify/',
      '.claude/',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { import: importPlugin },
    settings: {
      'import/resolver': { typescript: { project: './tsconfig.json' } },
    },
    rules: {
      // Principio XV / skill code-smells
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-console': 'error',
      'no-empty': 'error',
      complexity: ['error', 10],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'max-depth': ['error', 3],
      'import/no-cycle': 'error',
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    plugins: { jest: jestPlugin },
    rules: {
      ...jestPlugin.configs['flat/recommended'].rules,
      // `request(app).get(...).expect(200)` de Supertest también es una aserción.
      'jest/expect-expect': [
        'error',
        {
          // `expect*`: también cuentan como aserción los helpers que empiezan con expect (expectProblem).
          assertFunctionNames: ['expect*', 'request.**.expect', 'send.**.expect', 'post.**.expect'],
        },
      ],
      // Los bloques describe() agrupan muchos casos; el límite por función aplica al código de producción.
      'max-lines-per-function': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['eslint.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
