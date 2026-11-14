import type { Config } from 'jest';

const tsTransform = { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] as [string, object] };

const config: Config = {
  // Cobertura solo de la lógica de negocio (principio XV): services, cálculo de holdings,
  // estrategias, config y shared. Repositorios y rutas se cubren con los tests funcionales.
  collectCoverageFrom: [
    'src/**/*.service.ts',
    'src/holdings/compute-holdings.ts',
    'src/orders/order-type.strategy.ts',
    'src/config.ts',
    'src/shared/**/*.ts',
    '!src/shared/logger.ts',
    '!src/shared/http/openapi.ts',
    '!src/**/*.spec.ts',
  ],
  coverageThreshold: { global: { lines: 80, branches: 80 } },
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/*.spec.ts'],
      transform: tsTransform,
      setupFiles: ['reflect-metadata'],
    },
    {
      displayName: 'functional',
      testEnvironment: 'node',
      roots: ['<rootDir>/test'],
      testMatch: ['**/*.functional.spec.ts'],
      transform: tsTransform,
      setupFiles: ['reflect-metadata'],
      testTimeout: 30000,
    },
  ],
};

export default config;
