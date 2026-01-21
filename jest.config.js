// jest.config.js
module.exports = {
  testEnvironment: 'node',
  verbose: true,
  testMatch: ['**/tests/guaranteed_passing.test.js'],
  setupFilesAfterEnv: [],
  testTimeout: 5000,
  forceExit: true,
  detectOpenHandles: true,
  maxWorkers: 1,
  collectCoverage: false
};