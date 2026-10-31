// customer-mobile tests (repo root). Other units run their own test runner (Vitest).
module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/apps/', '<rootDir>/packages/', '<rootDir>/infra/', '<rootDir>/dist/'],
  // The first UI test in each file also loads the React Native test environment,
  // which can exceed Jest's 5s default on slower machines (notably Windows).
  testTimeout: 20000,
};
