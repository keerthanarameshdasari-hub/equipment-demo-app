// Load .env for local development (CI passes real environment variables instead).
require('dotenv').config();

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'transform-inline-environment-variables',
      {
        // Allow-list: ONLY these variables are copied into the app bundle.
        // Never add server-side secrets (e.g. a Supabase service-role key) here.
        include: ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'],
      },
    ],
  ],
};
