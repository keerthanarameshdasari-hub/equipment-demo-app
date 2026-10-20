/**
 * The publishing interface for equipDemo. Build and test workflows never call a
 * store directly; publish.yml calls these operations on whichever adapter is
 * selected (mock, google-play, app-store-connect). See docs/PUBLISHING.md.
 *
 * Every adapter implements:
 *   validateArtifact(ctx)            -> Result   checks binary + metadata + approvals; no side effects
 *   uploadBuild(ctx)                 -> Result   details.buildId identifies the upload
 *   assignTrack(ctx, buildId)        -> Result   puts the build on ctx.metadata.track
 *   requestReview(ctx, buildId)      -> Result   submits for store review (production) / records not needed
 *   startRollout(ctx, buildId)       -> Result   releases to ctx.metadata.rolloutPercentage of users
 *   getStatus(ctx, buildId)          -> Result   current state of the release
 *
 * Result = { operation, adapter, simulated, storeContacted, status, at, details, disclaimer? }
 * Adapters signal failure by throwing PublishError; they never return a partial success.
 */
'use strict';

const OPERATIONS = ['validateArtifact', 'uploadBuild', 'assignTrack', 'requestReview', 'startRollout', 'getStatus'];

const TRACKS = ['internal', 'alpha', 'beta', 'production'];

/** Stage a candidate must have reached (release-record.json) before each track. */
const TRACK_MIN_STAGE = { internal: 'SIT', alpha: 'QA', beta: 'QA', production: 'PROD' };

class PublishError extends Error {
  /**
   * @param {'rejected'|'disabled'|'credentials_missing'|'not_implemented'|'invalid_state'} code
   * @param {string} message
   * @param {string[]} [problems]
   */
  constructor(code, message, problems = []) {
    super(problems.length ? `${message}\n  - ${problems.join('\n  - ')}` : message);
    this.name = 'PublishError';
    this.code = code;
    this.problems = problems;
  }
}

/** Throws unless `adapter` implements every operation of the interface. */
function assertImplementsInterface(adapter) {
  const missing = OPERATIONS.filter(op => typeof adapter[op] !== 'function');
  if (missing.length || typeof adapter.name !== 'string' || typeof adapter.simulated !== 'boolean') {
    throw new Error(`Adapter ${adapter.name || '?'} does not implement: ${missing.join(', ') || 'name/simulated'}`);
  }
  return adapter;
}

module.exports = { OPERATIONS, TRACKS, TRACK_MIN_STAGE, PublishError, assertImplementsInterface };
