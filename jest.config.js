module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  // The first UI test in each file also loads the React Native test environment,
  // which can exceed Jest's 5s default on slower machines (notably Windows).
  testTimeout: 20000,
};
