// Live checks against the real Supabase project. Run with: npm run test:integration
// Requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (from .env or the environment).
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__integration__/**/*.test.ts'],
  testTimeout: 30000,
};
