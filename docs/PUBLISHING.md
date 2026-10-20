# Publishing adapter

Store publishing is separated from building, testing and promotion. A small interface
(`scripts/publish/interface.js`) defines six operations. Adapters implement them, and one workflow,
`.github/workflows/publish.yml`, calls whichever adapter is selected. Swapping the mock for a real
store means adding an adapter. No build, test or promotion workflow changes.

```
release.yml ─► promote.yml ─► publish.yml ──► publishing interface ──┬─► mock               (SIMULATED, default)
 (build)       (stages)       (separate,       validateArtifact       ├─► google-play        (refuses safely)
                               approved)        uploadBuild           └─► app-store-connect  (refuses safely)
                                                assignTrack
                                                requestReview
                                                startRollout
                                                getStatus
```

## The interface

| Operation | Purpose | Mock result status |
|---|---|---|
| `validateArtifact(ctx)` | Checksum, manifest, metadata, stage reached, approvals. No side effects | `VALIDATED` (validation is real) |
| `uploadBuild(ctx)` | Upload the binary; returns a `buildId` | `SIMULATED_UPLOADED` |
| `assignTrack(ctx, buildId)` | Put the build on `internal`, `alpha`, `beta` or `production` | `SIMULATED_ON_TRACK` |
| `requestReview(ctx, buildId)` | Submit for store review | `SIMULATED_REVIEW_REQUESTED` |
| `startRollout(ctx, buildId)` | Release to a percentage of users | `SIMULATED_ROLLOUT_STARTED` |
| `getStatus(ctx, buildId)` | Current state and history | current `SIMULATED_*` state |

Every result: `{ operation, adapter, simulated, storeContacted, status, at, details, disclaimer }`.
Failures are thrown as `PublishError` with a `code`: `rejected`, `invalid_state`, `disabled`,
`credentials_missing` or `not_implemented`. An adapter never returns a partial success.

## Validation (shared by every adapter)

`scripts/publish/validation.js` runs before any adapter does anything, so a real integration can
never be looser than the mock.

| Check | Rejected when |
|---|---|
| Artifact | APK missing; SHA-256 differs from `release-manifest.json` or `SHA256SUMS.txt`; size differs; manifest/record describe different binaries |
| Identity | APK versionCode ≠ build number; versionName ≠ app version |
| `applicationId` | Missing, malformed, a `.dev` (development) ID, or different from the APK |
| `track` | Not one of `internal`, `alpha`, `beta`, `production` |
| `rolloutPercentage` | Not a whole number 1–100; below 100 on a testing track |
| `releaseNotes` | Missing `en-US`, empty, over 500 characters, or invalid locale |
| Stage reached | `internal` needs SIT; `alpha`/`beta` need QA; `production` needs PROD |
| Production approval | No approved PROD stage in `release-record.json`, **or** the publish run itself was not approved by a PROD reviewer |

## The mock publisher: what it promises

- It **validates for real** and rejects bad inputs exactly as a real adapter would.
- It **never contacts a store** and never says it did. Every result has `simulated: true`,
  `storeContacted: false`, a status starting with `SIMULATED_`, and the disclaimer
  *"SIMULATED: no store was contacted. Nothing was uploaded to, reviewed by or released through
  Google Play or the App Store."*
- It enforces the real order (upload → track → review → rollout) and refuses to reuse a versionCode.
- Its log (`publish-log-mock-…-SIMULATED-run….json`) is attached to the release candidate as evidence.

No store account is needed for any of this.

## Credentials and safety

Real adapters refuse in this order, and every refusal ends with "Nothing was sent.":

1. **Not enabled** unless the repository variable `REAL_PUBLISHING_ENABLED` is `true`. It is not set.
2. **Credentials missing** unless the store secrets exist. They don't; nothing is stored in GitHub.
3. **Rejected** by the shared validation plus store rules: Google Play requires an `.aab` for new apps;
   App Store Connect requires a signed `.ipa`, which CI doesn't build.
4. **Not implemented**, naming the exact store API call to implement.

`publish.yml` passes a store secret to its steps **only** when `REAL_PUBLISHING_ENABLED` is `true` and that
store's adapter is selected. With the mock, the secrets are not even referenced at runtime. Adapters
check only whether credentials are *present*; values are never printed.

## Running it

**Actions → Publish (store adapter) → Run workflow:**

| Input | Example |
|---|---|
| rc_tag | `v1.1.2-rc.1` |
| target | `mock` |
| track | `internal` (QA approval) or `production` (PROD approval) |
| rollout_percentage | `100` (testing) / e.g. `20` (production staged rollout) |
| release_notes | `Equipment list and add form` |
| application_id | `com.equipmentdemo.app` |
| demo_corrupt_artifact | leave off; turn on only to demonstrate checksum rejection |

Locally (no GitHub needed), with a downloaded release folder:

```bash
node scripts/publish/cli.js metadata --out meta.json --application-id com.equipmentdemo.app \
  --track internal --rollout 100 --notes "Internal test build"
node scripts/publish/cli.js validate --target mock --dir path/to/release --metadata meta.json --log log.json
```

## Future integration points

### Google Play (`scripts/publish/adapters/store.js`, `google-play`)

| Operation | Android Publisher API v3 |
|---|---|
| validateArtifact | `edits.insert`; validate the AAB (bundletool) |
| uploadBuild | `edits.bundles.upload` |
| assignTrack | `edits.tracks.update` (`internal` / `alpha` / `beta` / `production`, `releases[].versionCodes`, release notes) |
| requestReview | `edits.commit` (Google reviews committed changes) |
| startRollout | `edits.tracks.update` with `status: inProgress` + `userFraction` (or `completed`), then `edits.commit` |
| getStatus | `edits.tracks.get` / `edits.tracks.list` |

Prerequisites: a Play Console developer account and app; build an **AAB** (`bundleRelease`) signed with an
**upload key** stored as an encrypted secret, with Play App Signing on; a Google Cloud service account
granted API access in Play Console, its JSON key stored as the `PLAY_SERVICE_ACCOUNT_JSON` secret
(ideally in the PROD environment); and versionCodes from the release pipeline, which are already unique
and increasing.

### App Store Connect (`app-store-connect`)

| Operation | Tool / App Store Connect API |
|---|---|
| validateArtifact | `xcrun altool --validate-app` / Transporter on the signed `.ipa` |
| uploadBuild | `xcrun altool --upload-app` / Transporter; poll `builds` until `processingState = VALID` |
| assignTrack | TestFlight: add build to `betaGroups`; App Store: attach build to an `appStoreVersions` record |
| requestReview | TestFlight external: `betaAppReviewSubmissions`; App Store: `reviewSubmissions` + `reviewSubmissionItems` |
| startRollout | `appStoreVersionPhasedReleases` or `appStoreVersionReleaseRequests` |
| getStatus | `appStoreVersions.appStoreState`, `builds.processingState` |

Prerequisites: an Apple Developer Program membership; a macOS CI job that builds and signs an `.ipa`
(certificate and provisioning profile as encrypted secrets); `CFBundleVersion` = the build number from
the manifest; an App Store Connect API key stored as `ASC_KEY_ID`, `ASC_ISSUER_ID` and `ASC_PRIVATE_KEY`.

### Enabling a real integration later

1. Implement the adapter's operations (replace the `not_implemented` refusals) and add tests.
2. Store credentials as **environment secrets on PROD** (and QA for testing tracks).
3. Set the repository variable `REAL_PUBLISHING_ENABLED=true` deliberately, and remove it to switch back off.
4. Keep the shared validation: it is what guarantees the same checks for mock and real publishing.
