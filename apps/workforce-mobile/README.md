# workforce-mobile

Workforce (field staff) app. **Current state: logic-only unit.** It contains the view-model
(`src/fleetSummary.ts`) and API access (`src/api.ts`, through `@equipdemo/contracts`), with tests,
but **no native shell yet**, so it is testable but not yet installable.

Why: creating a second bare React Native project (its own `android/` and `ios/`) duplicates native
toolchain maintenance and can only be verified on CI/macOS. Decide first whether workforce is
(a) a separate React Native app here, or (b) a role/flavour of customer-mobile. Either way, this
package's code is reused unchanged.

```bash
npm run test -w @equipdemo/workforce-mobile
npm run build -w @equipdemo/workforce-mobile   # tsc -> dist/
```

Config: `WORKFORCE_API_BASE_URL` (public; validated with `loadPublicConfig`).
