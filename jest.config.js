/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["<rootDir>/tests/**/*.spec.ts", "<rootDir>/src/**/*.spec.ts"],
  moduleNameMapper: {
    "^@src/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.test.json" }],
  },
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
  globalSetup: "<rootDir>/tests/setup/global-setup.ts",
  // Una sola base compartida: las pruebas deben correr en serie.
  maxWorkers: 1,
  testTimeout: 30000,
  clearMocks: true,
  // Cobertura de TODO el código del API (también el que ninguna prueba toca): `pnpm test:coverage`.
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"],
  coverageReporters: ["text-summary", "text", "json-summary", "lcov"],
};
