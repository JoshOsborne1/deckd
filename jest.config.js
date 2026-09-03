/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Run in-band. jest-worker gives workers a hardcoded 500ms (FORCE_EXIT_DELAY)
  // to exit after CHILD_MESSAGE_END; on Windows/Node 24 ts-jest teardown
  // sometimes misses that window and gets force-killed, printing a false
  // "failed to exit gracefully" teardown warning (2/3 runs measured). Proven
  // NOT a test leak: --detectOpenHandles (in-band) reports zero open handles.
  // In-band is not slower here (measured 2026-09-03: 34s in-band vs 40s with
  // 2 workers on 4 cores) and exits clean every run.
  maxWorkers: 1,
  roots: ['<rootDir>/src', '<rootDir>/lib'],
  moduleNameMapper: {
    '^@lib/(.*)$': '<rootDir>/lib/$1',
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
    '^@store/(.*)$': '<rootDir>/src/store/$1',
    '^@theme$': '<rootDir>/src/lib/theme',
  },
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
};
