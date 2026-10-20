/**
 * Publisher-independent checks. Every adapter (mock or real) runs these first,
 * so a real integration can never be looser than the mock.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const release = require('../release/lib');
const { STAGES } = require('../release/stages');
const { TRACKS, TRACK_MIN_STAGE } = require('./interface');

const APP_ID = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
const NOTES_MAX = 500; // Google Play's limit per language

/**
 * Loads everything a publisher needs from a downloaded release folder
 * (APK, release-manifest.json, SHA256SUMS.txt, release-record.json) and the
 * publish metadata. Missing files are reported by validate(), not thrown here.
 */
function loadContext({ dir, metadata, publishApprovedBy = [] }) {
  const read = name => {
    const file = path.join(dir, name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined;
  };
  const parse = (name, text) => {
    try {
      return text === undefined ? undefined : JSON.parse(text);
    } catch {
      return { __invalid: `${name} is not valid JSON` };
    }
  };
  const manifest = parse('release-manifest.json', read('release-manifest.json'));
  return {
    dir,
    manifest,
    record: parse('release-record.json', read('release-record.json')),
    sha256SumsText: read('SHA256SUMS.txt'),
    apkPath: manifest && manifest.artifact ? path.join(dir, manifest.artifact.file) : undefined,
    metadata: metadata || {},
    publishApprovedBy: publishApprovedBy.filter(Boolean),
  };
}

function validateMetadata(metadata, manifest) {
  const problems = [];
  const { applicationId, track, rolloutPercentage, releaseNotes } = metadata;

  if (typeof applicationId !== 'string' || !APP_ID.test(applicationId)) {
    problems.push(`metadata.applicationId "${applicationId}" is not a valid application ID`);
  } else {
    if (applicationId.endsWith('.dev')) {
      problems.push('Development builds (".dev" application ID) cannot be published');
    }
    const built = manifest?.platforms?.android?.applicationId;
    if (built && applicationId !== built) {
      problems.push(`metadata.applicationId ${applicationId} does not match the APK (${built})`);
    }
  }

  if (!TRACKS.includes(track)) {
    problems.push(`metadata.track "${track}" must be one of: ${TRACKS.join(', ')}`);
  }

  if (!Number.isInteger(rolloutPercentage) || rolloutPercentage < 1 || rolloutPercentage > 100) {
    problems.push(`metadata.rolloutPercentage "${rolloutPercentage}" must be a whole number from 1 to 100`);
  } else if (track !== 'production' && rolloutPercentage !== 100) {
    problems.push('Staged rollout (below 100%) is only allowed on the production track');
  }

  if (!releaseNotes || typeof releaseNotes !== 'object' || Array.isArray(releaseNotes)) {
    problems.push('metadata.releaseNotes is required, e.g. { "en-US": "What changed" }');
  } else {
    if (!releaseNotes['en-US']) {
      problems.push('metadata.releaseNotes needs an "en-US" entry');
    }
    for (const [lang, text] of Object.entries(releaseNotes)) {
      if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(lang)) {
        problems.push(`Release notes language "${lang}" is not a valid locale (e.g. en-US)`);
      }
      if (typeof text !== 'string' || text.trim().length === 0) {
        problems.push(`Release notes for ${lang} are empty`);
      } else if (text.length > NOTES_MAX) {
        problems.push(`Release notes for ${lang} exceed ${NOTES_MAX} characters`);
      }
    }
  }
  return problems;
}

function validateArtifactIdentity(ctx) {
  const { manifest, record } = ctx;
  if (!manifest) {
    return ['release-manifest.json is missing'];
  }
  if (manifest.__invalid) {
    return [manifest.__invalid];
  }
  const problems = [];
  if (!ctx.apkPath || !fs.existsSync(ctx.apkPath)) {
    problems.push(`The APK named in the manifest (${manifest.artifact?.file}) is missing`);
  } else {
    if (ctx.sha256SumsText === undefined) {
      problems.push('SHA256SUMS.txt is missing');
    }
    problems.push(
      ...release.verifyArtifact({ manifest, apkPath: ctx.apkPath, sha256SumsText: ctx.sha256SumsText }).problems,
    );
  }
  const android = manifest.platforms?.android || {};
  if (android.versionCode !== manifest.buildNumber) {
    problems.push(`APK versionCode ${android.versionCode} does not match build number ${manifest.buildNumber}`);
  }
  if (android.versionName !== manifest.version || !release.isSemver(manifest.version || '')) {
    problems.push(`APK versionName ${android.versionName} does not match app version ${manifest.version}`);
  }
  if (!record) {
    problems.push('release-record.json is missing');
  } else if (record.__invalid) {
    problems.push(record.__invalid);
  } else if (record.artifact?.sha256 !== manifest.artifact?.sha256) {
    problems.push('release-record.json describes a different binary than the manifest');
  }
  return problems;
}

/** The candidate must have passed the stage each track requires; production needs explicit approval. */
function validateApprovals(ctx) {
  const { record, metadata } = ctx;
  const minStage = TRACK_MIN_STAGE[metadata.track];
  if (!minStage || !record || record.__invalid || !Array.isArray(record.stages)) {
    return [];
  }
  const problems = [];
  const reached = record.stages.map(s => s.stage);
  const highest = Math.max(...reached.map(s => STAGES.indexOf(s)));
  if (highest < STAGES.indexOf(minStage)) {
    problems.push(
      `Track ${metadata.track} requires the candidate to have passed ${minStage}; it has reached ${STAGES[highest] || 'nothing'}`,
    );
  }
  if (metadata.track === 'production') {
    const prod = record.stages.find(s => s.stage === 'PROD');
    if (!prod || !Array.isArray(prod.approvedBy) || prod.approvedBy.length === 0) {
      problems.push('Production requires a PROD stage entry approved by a reviewer');
    }
    if (ctx.publishApprovedBy.length === 0) {
      problems.push('Production publishing requires explicit approval of this publish run (PROD environment reviewer)');
    }
  }
  return problems;
}

/** All publisher-independent checks. Returns a list of problems (empty = valid). */
function validate(ctx) {
  return [...validateArtifactIdentity(ctx), ...validateMetadata(ctx.metadata, ctx.manifest), ...validateApprovals(ctx)];
}

module.exports = { loadContext, validate, validateMetadata, NOTES_MAX };
