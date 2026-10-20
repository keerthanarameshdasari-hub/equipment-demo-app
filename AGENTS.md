equipDemo is a **bare React Native** app (React Native CLI, no Expo) with TypeScript and a Supabase backend.

## Project rules

- `android/` and `ios/` are committed source code. Edit them directly; nothing regenerates them.
- Do not add Expo packages (`expo`, `expo-*`, `jest-expo`) or EAS configuration.
- Navigation uses React Navigation (native-stack).
- Package manager: **npm**. Commit `package-lock.json` with every dependency change.
- Keep React Native-related package versions aligned with `react-native` (currently 0.86.3).

## Commands

```bash
npm install            # install dependencies
npm start              # Metro dev server (add -- --reset-cache after changing .env)
npm run android        # build and run on an Android device/emulator
npm run ios            # build and run on iOS (macOS only; run `cd ios && pod install` first)
npm test               # Jest
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint
cd android && ./gradlew assembleRelease   # release APK (signed with the debug key; demo only)
npm run version:set X.Y.Z  # change the app version (package.json, lockfile, iOS) - never edit by hand
```

## Versions and releases

- App version lives in `package.json`; build numbers are assigned by CI. See `docs/RELEASES.md`.
- Release binaries are built only by `.github/workflows/release.yml` from an RC tag, and promoted by
  `promote.yml` without rebuilding.

Run tests and typecheck before declaring any task done.

## Configuration and secrets

- Runtime config is read from `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (see `.env.example`).
- `babel.config.js` inlines ONLY allow-listed variables into the bundle. Never add server-side
  secrets (service-role keys, AWS credentials) to that list or to the app.
- `.env` files, keystores and signing certificates are git-ignored and must stay out of the repo.
