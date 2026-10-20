const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, expect, test } = require('@jest/globals');
const release = require('../scripts/release/lib');
const { createPublisher, TARGETS } = require('../scripts/publish');
const { OPERATIONS, PublishError } = require('../scripts/publish/interface');
const { loadContext } = require('../scripts/publish/validation');

/** Builds a release folder like the one promote.yml/publish.yml download. */
function makeRelease({ upTo = 'PROD', approved = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-'));
  const file = 'equipdemo-v1.1.2-rc.1-build1041.apk';
  fs.writeFileSync(path.join(dir, file), 'pretend APK bytes');
  const sha256 = release.sha256File(path.join(dir, file));
  const manifest = release.createManifest({
    version: '1.1.2',
    buildNumber: 1041,
    rcTag: 'v1.1.2-rc.1',
    rc: 1,
    apk: { applicationId: 'com.equipmentdemo.app', versionName: '1.1.2', versionCode: 1041 },
    commit: 'c'.repeat(40),
    artifactFile: file,
    sizeBytes: fs.statSync(path.join(dir, file)).size,
    sha256,
  });
  let record = release.createReleaseRecord(manifest, { at: 't', by: 'release workflow' });
  for (const stage of ['SIT', 'QA', 'UAT', 'PRE-PROD', 'PROD']) {
    record = release.appendStage(record, {
      stage,
      at: 't',
      by: 'owner',
      approvedBy: approved && stage !== 'SIT' ? ['owner'] : undefined,
      artifactSha256: sha256,
    });
    if (stage === upTo) {
      break;
    }
  }
  fs.writeFileSync(path.join(dir, 'release-manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(dir, 'release-record.json'), JSON.stringify(record));
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), `${sha256}  ${file}\n`);
  return { dir, file };
}

const metadata = (overrides = {}) => ({
  applicationId: 'com.equipmentdemo.app',
  track: 'internal',
  rolloutPercentage: 100,
  releaseNotes: { 'en-US': 'Equipment list and add form' },
  ...overrides,
});

async function runFlow(publisher, ctx) {
  const results = [await publisher.validateArtifact(ctx)];
  const upload = await publisher.uploadBuild(ctx);
  const id = upload.details.buildId;
  results.push(upload);
  results.push(await publisher.assignTrack(ctx, id));
  results.push(await publisher.requestReview(ctx, id));
  results.push(await publisher.startRollout(ctx, id));
  results.push(await publisher.getStatus(ctx, id));
  return results;
}

describe('publishing interface', () => {
  test('every adapter implements all six operations', () => {
    for (const target of TARGETS) {
      const publisher = createPublisher(target);
      for (const op of OPERATIONS) {
        expect(typeof publisher[op]).toBe('function');
      }
    }
    expect(() => createPublisher('itch-io')).toThrow(/Unknown publish target/);
  });
});

describe('mock publisher', () => {
  test('a valid production release succeeds, and every result says it was simulated', async () => {
    const { dir } = makeRelease();
    const ctx = loadContext({
      dir,
      metadata: metadata({ track: 'production', rolloutPercentage: 20 }),
      publishApprovedBy: ['owner'],
    });
    const results = await runFlow(createPublisher('mock'), ctx);

    expect(results.map(r => r.status)).toEqual([
      'VALIDATED',
      'SIMULATED_UPLOADED',
      'SIMULATED_ON_TRACK',
      'SIMULATED_REVIEW_REQUESTED',
      'SIMULATED_ROLLOUT_STARTED',
      'SIMULATED_ROLLOUT_STARTED',
    ]);
    for (const r of results) {
      expect(r).toMatchObject({ adapter: 'mock', simulated: true, storeContacted: false });
      expect(r.disclaimer).toMatch(/SIMULATED: no store was contacted/);
      // Never claims a real upload or release.
      expect(r.status).not.toMatch(/^(UPLOADED|RELEASED|LIVE|PUBLISHED)$/);
    }
    expect(results[5].details).toMatchObject({ track: 'production', rolloutPercentage: 20, versionCode: 1041 });
  });

  test('refuses steps out of order and re-uploading the same versionCode', async () => {
    const { dir } = makeRelease();
    const ctx = loadContext({ dir, metadata: metadata() });
    const publisher = createPublisher('mock');
    const { details } = await publisher.uploadBuild(ctx);
    await expect(publisher.startRollout(ctx, details.buildId)).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(publisher.uploadBuild(ctx)).rejects.toThrow(/already \(simulated\) uploaded/);
  });

  test.each([
    [{ track: 'staging' }, /track "staging"/],
    [{ applicationId: 'com.other.app' }, /does not match the APK/],
    [{ applicationId: 'com.equipmentdemo.app.dev' }, /Development builds/],
    [{ applicationId: 'Not An Id' }, /not a valid application ID/],
    [{ rolloutPercentage: 0 }, /whole number from 1 to 100/],
    [{ rolloutPercentage: 50 }, /only allowed on the production track/],
    [{ releaseNotes: undefined }, /releaseNotes is required/],
    [{ releaseNotes: { 'en-US': '   ' } }, /are empty/],
    [{ releaseNotes: { 'en-US': 'x'.repeat(501) } }, /exceed 500/],
  ])('rejects invalid metadata %p', async (overrides, message) => {
    const { dir } = makeRelease();
    const ctx = loadContext({ dir, metadata: metadata(overrides) });
    const error = await createPublisher('mock')
      .validateArtifact(ctx)
      .catch(e => e);
    expect(error).toBeInstanceOf(PublishError);
    expect(error.code).toBe('rejected');
    expect(error.message).toMatch(message);
  });

  test('rejects an artifact whose checksum does not match', async () => {
    const { dir, file } = makeRelease();
    fs.appendFileSync(path.join(dir, file), 'tampered');
    const ctx = loadContext({ dir, metadata: metadata() });
    await expect(createPublisher('mock').uploadBuild(ctx)).rejects.toThrow(/SHA-256 of .* is/);
  });

  test('rejects missing release files', async () => {
    const { dir } = makeRelease();
    fs.rmSync(path.join(dir, 'SHA256SUMS.txt'));
    fs.rmSync(path.join(dir, 'release-record.json'));
    const ctx = loadContext({ dir, metadata: metadata() });
    await expect(createPublisher('mock').validateArtifact(ctx)).rejects.toThrow(
      /SHA256SUMS.txt is missing[\s\S]*release-record.json is missing/,
    );
  });

  test('production needs PROD approval in the record AND approval of the publish run', async () => {
    const notApproved = makeRelease({ upTo: 'PRE-PROD' });
    await expect(
      createPublisher('mock').validateArtifact(
        loadContext({ dir: notApproved.dir, metadata: metadata({ track: 'production' }), publishApprovedBy: ['owner'] }),
      ),
    ).rejects.toThrow(/requires the candidate to have passed PROD[\s\S]*PROD stage entry approved/);

    const approved = makeRelease();
    await expect(
      createPublisher('mock').validateArtifact(loadContext({ dir: approved.dir, metadata: metadata({ track: 'production' }) })),
    ).rejects.toThrow(/explicit approval of this publish run/);
  });

  test('testing tracks need the candidate to have passed SIT (internal) or QA (alpha/beta)', async () => {
    const { dir } = makeRelease({ upTo: 'SIT' });
    const publisher = createPublisher('mock');
    await expect(publisher.validateArtifact(loadContext({ dir, metadata: metadata() }))).resolves.toMatchObject({
      status: 'VALIDATED',
    });
    await expect(
      publisher.validateArtifact(loadContext({ dir, metadata: metadata({ track: 'beta' }) })),
    ).rejects.toThrow(/requires the candidate to have passed QA/);
  });
});

describe('real store adapters fail safely (no store account needed)', () => {
  const ctxFor = () => loadContext({ dir: makeRelease().dir, metadata: metadata() });

  test.each(['google-play', 'app-store-connect'])('%s refuses unless explicitly enabled', async target => {
    const publisher = createPublisher(target, { env: {} });
    expect(publisher.simulated).toBe(false);
    for (const op of OPERATIONS) {
      await expect(publisher[op](ctxFor())).rejects.toMatchObject({ code: 'disabled' });
    }
  });

  test('refuses when enabled but credentials are missing, without printing secrets', async () => {
    const play = createPublisher('google-play', { env: { REAL_PUBLISHING_ENABLED: 'true' } });
    await expect(play.uploadBuild(ctxFor())).rejects.toMatchObject({
      code: 'credentials_missing',
      problems: ['PLAY_SERVICE_ACCOUNT_JSON is not set'],
    });
    const asc = createPublisher('app-store-connect', {
      env: { REAL_PUBLISHING_ENABLED: 'true', ASC_KEY_ID: 'secret-key-id' },
    });
    const error = await asc.uploadBuild(ctxFor()).catch(e => e);
    expect(error.code).toBe('credentials_missing');
    expect(error.message).not.toContain('secret-key-id');
  });

  test('with credentials, still rejects unsupported artifacts and never pretends to publish', async () => {
    const env = { REAL_PUBLISHING_ENABLED: 'true', PLAY_SERVICE_ACCOUNT_JSON: '{}' };
    await expect(createPublisher('google-play', { env }).uploadBuild(ctxFor())).rejects.toThrow(/App Bundle \(\.aab\)/);
    const ascEnv = { REAL_PUBLISHING_ENABLED: 'true', ASC_KEY_ID: 'k', ASC_ISSUER_ID: 'i', ASC_PRIVATE_KEY: 'p' };
    await expect(createPublisher('app-store-connect', { env: ascEnv }).uploadBuild(ctxFor())).rejects.toThrow(
      /No iOS build/,
    );
  });
});
