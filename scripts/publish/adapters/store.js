/**
 * Real-store adapters (Google Play, App Store Connect): placeholders that FAIL
 * SAFELY. They implement the interface, so publish.yml can select them, but
 * every operation refuses, in this order:
 *   1. real publishing not explicitly enabled (REAL_PUBLISHING_ENABLED=true)  -> 'disabled'
 *   2. store credentials missing                                             -> 'credentials_missing'
 *   3. inputs invalid (same validation as the mock, plus store rules)        -> 'rejected'
 *   4. integration not implemented yet                                       -> 'not_implemented'
 * Credentials are only checked for presence; their values are never logged.
 * Each refusal names the API call a real integration would make (docs/PUBLISHING.md).
 */
'use strict';

const { OPERATIONS, PublishError } = require('../interface');
const { validate } = require('../validation');

const STORES = {
  'google-play': {
    label: 'Google Play',
    credentials: ['PLAY_SERVICE_ACCOUNT_JSON'],
    extraChecks: ctx =>
      ctx.manifest?.artifact?.file?.endsWith('.apk')
        ? ['Google Play requires an Android App Bundle (.aab) for new apps; build with bundleRelease and an upload key']
        : [],
    integration: {
      validateArtifact: 'Android Publisher API v3: edits.insert, then validate AAB with bundletool',
      uploadBuild: 'edits.bundles.upload (AAB) within the edit',
      assignTrack: 'edits.tracks.update: track = internal | alpha | beta | production, releases[].versionCodes',
      requestReview: 'edits.commit (Google reviews committed changes; changesNotSentForReview controls batching)',
      startRollout: 'edits.tracks.update: status inProgress with userFraction (or completed), then edits.commit',
      getStatus: 'edits.tracks.get / edits.tracks.list',
    },
  },
  'app-store-connect': {
    label: 'App Store Connect',
    credentials: ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY'],
    extraChecks: ctx =>
      ctx.manifest?.platforms?.ios?.built
        ? []
        : ['No iOS build (.ipa) exists for this candidate; iOS is not built in CI yet'],
    integration: {
      validateArtifact: 'xcrun altool --validate-app (or Transporter) on the signed .ipa',
      uploadBuild: 'xcrun altool --upload-app / Transporter; poll builds until processingState = VALID',
      assignTrack: 'TestFlight: add build to betaGroups; production: attach build to an appStoreVersions record',
      requestReview: 'TestFlight external: betaAppReviewSubmissions; App Store: reviewSubmissions + reviewSubmissionItems',
      startRollout: 'appStoreVersionPhasedReleases (phased) or appStoreVersionReleaseRequests (manual release)',
      getStatus: 'appStoreVersions.appStoreState and builds.processingState',
    },
  },
};

function createStoreAdapter(storeName, { env = process.env } = {}) {
  const store = STORES[storeName];
  if (!store) {
    throw new Error(`Unknown store adapter ${storeName}`);
  }

  const guard = (operation, ctx) => {
    if (env.REAL_PUBLISHING_ENABLED !== 'true') {
      throw new PublishError(
        'disabled',
        `${store.label} publishing is not enabled. Real store integrations run only when REAL_PUBLISHING_ENABLED=true ` +
          'is set deliberately; use the mock adapter otherwise. Nothing was sent.',
      );
    }
    const missing = store.credentials.filter(name => !env[name] || !env[name].trim());
    if (missing.length) {
      throw new PublishError('credentials_missing', `${store.label} credentials are missing. Nothing was sent.`, missing.map(n => `${n} is not set`));
    }
    if (ctx) {
      const problems = [...validate(ctx), ...store.extraChecks(ctx)];
      if (problems.length) {
        throw new PublishError('rejected', `${store.label} adapter rejected the release. Nothing was sent.`, problems);
      }
    }
    throw new PublishError(
      'not_implemented',
      `${store.label} ${operation} is not implemented yet. Integration point: ${store.integration[operation]}. Nothing was sent.`,
    );
  };

  const adapter = { name: storeName, simulated: false };
  for (const operation of OPERATIONS) {
    adapter[operation] = async ctx => guard(operation, ctx);
  }
  return adapter;
}

module.exports = { createStoreAdapter, STORES };
