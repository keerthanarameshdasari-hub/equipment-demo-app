/**
 * Mock publisher: validates exactly like a real adapter, then records SIMULATED
 * outcomes. It never contacts a store and never reports that anything was
 * actually uploaded or released: every result has simulated: true,
 * storeContacted: false, a SIMULATED_* status and a disclaimer.
 */
'use strict';

const fs = require('fs');
const { PublishError } = require('../interface');
const { validate } = require('../validation');

const DISCLAIMER =
  'SIMULATED: no store was contacted. Nothing was uploaded to, reviewed by or released through Google Play or the App Store.';

/** Order a build must move through (mirrors the real stores). */
const FLOW = ['SIMULATED_UPLOADED', 'SIMULATED_ON_TRACK', 'SIMULATED_REVIEW_REQUESTED', 'SIMULATED_ROLLOUT_STARTED'];

function createMockPublisher({ stateFile, now = () => new Date() } = {}) {
  const load = () => (stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {});
  let builds = load();
  const save = () => stateFile && fs.writeFileSync(stateFile, JSON.stringify(builds, null, 2) + '\n');

  const result = (operation, status, details) => ({
    operation,
    adapter: 'mock',
    simulated: true,
    storeContacted: false,
    status,
    at: now().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    details,
    disclaimer: DISCLAIMER,
  });

  const ensureValid = ctx => {
    const problems = validate(ctx);
    if (problems.length) {
      throw new PublishError('rejected', 'Mock publisher rejected the release', problems);
    }
  };

  /** Moves a build to `next`, refusing to skip or repeat steps. */
  const advance = (buildId, next) => {
    const build = builds[buildId];
    if (!build) {
      throw new PublishError('invalid_state', `Unknown build ${buildId}; upload it first`);
    }
    const expectedPrevious = FLOW[FLOW.indexOf(next) - 1];
    if (build.status !== expectedPrevious) {
      throw new PublishError('invalid_state', `Build ${buildId} is ${build.status}; ${next} needs ${expectedPrevious}`);
    }
    build.status = next;
    build.history.push({ status: next, at: now().toISOString() });
    save();
    return build;
  };

  return {
    name: 'mock',
    simulated: true,

    async validateArtifact(ctx) {
      ensureValid(ctx);
      return result('validateArtifact', 'VALIDATED', {
        applicationId: ctx.metadata.applicationId,
        version: ctx.manifest.version,
        versionCode: ctx.manifest.buildNumber,
        sha256: ctx.manifest.artifact.sha256,
        track: ctx.metadata.track,
        note: 'Validation is real: checksum, manifest, metadata and approvals were checked.',
      });
    },

    async uploadBuild(ctx) {
      ensureValid(ctx);
      const { manifest } = ctx;
      const buildId = `SIMULATED-${manifest.buildNumber}-${manifest.artifact.sha256.slice(0, 12)}`;
      if (builds[buildId]) {
        throw new PublishError('invalid_state', `Build ${buildId} was already (simulated) uploaded; versionCodes cannot be reused`);
      }
      builds[buildId] = {
        buildId,
        applicationId: ctx.metadata.applicationId,
        versionCode: manifest.buildNumber,
        version: manifest.version,
        sha256: manifest.artifact.sha256,
        sourceCommit: manifest.source?.commit,
        status: 'SIMULATED_UPLOADED',
        history: [{ status: 'SIMULATED_UPLOADED', at: now().toISOString() }],
      };
      save();
      return result('uploadBuild', 'SIMULATED_UPLOADED', { buildId, versionCode: manifest.buildNumber });
    },

    async assignTrack(ctx, buildId) {
      const build = advance(buildId, 'SIMULATED_ON_TRACK');
      build.track = ctx.metadata.track;
      build.releaseNotes = ctx.metadata.releaseNotes;
      save();
      return result('assignTrack', 'SIMULATED_ON_TRACK', { buildId, track: build.track });
    },

    async requestReview(ctx, buildId) {
      const build = advance(buildId, 'SIMULATED_REVIEW_REQUESTED');
      const reviewRequired = build.track === 'production';
      build.reviewRequired = reviewRequired;
      save();
      return result('requestReview', 'SIMULATED_REVIEW_REQUESTED', {
        buildId,
        reviewRequired,
        note: reviewRequired
          ? 'A real store would now review the release; no review was actually requested.'
          : 'Testing tracks usually need no store review; recorded for completeness.',
      });
    },

    async startRollout(ctx, buildId) {
      const build = advance(buildId, 'SIMULATED_ROLLOUT_STARTED');
      build.rolloutPercentage = ctx.metadata.rolloutPercentage;
      save();
      return result('startRollout', 'SIMULATED_ROLLOUT_STARTED', {
        buildId,
        track: build.track,
        rolloutPercentage: build.rolloutPercentage,
        note: 'No users received this build; the rollout is simulated.',
      });
    },

    async getStatus(ctx, buildId) {
      const build = builds[buildId];
      if (!build) {
        throw new PublishError('invalid_state', `Unknown build ${buildId}`);
      }
      return result('getStatus', build.status, { ...build });
    },
  };
}

module.exports = { createMockPublisher, DISCLAIMER };
