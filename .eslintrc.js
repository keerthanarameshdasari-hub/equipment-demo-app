// Backend SDKs and backend-specific modules the UI must never import directly.
// The UI talks only to the EquipmentRepository interface (src/data/EquipmentRepository.ts),
// so the backend (Supabase today, AWS Amplify later) can change without UI changes.
const BACKEND_IMPORTS = {
  patterns: [
    {
      group: ['@supabase/*', 'aws-amplify', 'aws-amplify/*', '@aws-amplify/*', '@aws-sdk/*'],
      message: 'UI code must not use a backend SDK. Use the EquipmentRepository interface (useEquipmentRepository).',
    },
    {
      group: ['**/data/supabase*', '**/data/amplify*', '**/config/env'],
      message: 'UI code must not depend on a specific backend. Use the EquipmentRepository interface.',
    },
  ],
};

module.exports = {
  root: true,
  extends: '@react-native',
  overrides: [
    {
      // Node.js release tooling (CommonJS, prints to the console by design).
      files: ['scripts/**/*.js'],
      env: { node: true },
    },
    {
      // UI layer: screens, shared UI, navigation and the app shell.
      files: ['src/screens/**', 'src/ui/**', 'src/navigation/**', 'src/domain/**', 'App.tsx'],
      rules: { 'no-restricted-imports': ['error', BACKEND_IMPORTS] },
    },
  ],
};
