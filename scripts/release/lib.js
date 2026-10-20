/**
 * Release helpers for equipDemo: version conventions, build numbers,
 * release manifests, checksum verification and stage records.
 * Plain Node.js (no dependencies) so CI and developers can run it anywhere.
 * See docs/RELEASES.md for the conventions these functions implement.
 */
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { STAGES, getStage } = require('./stages');

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const RC_TAG = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-rc\.([1-9]\d*)$/;

/** Release build numbers start here; anything lower is a local or dev build. */
const RELEASE_BUILD_BASE = 1000;
/** Highest versionCode Google Play accepts. */
const MAX_VERSION_CODE = 2100000000;

function isSemver(version) {
  return SEMVER.test(version);
}

/** "v1.1.1-rc.2" -> { version: "1.1.1", rc: 2, finalTag: "v1.1.1" } */
function parseRcTag(tag) {
  const match = RC_TAG.exec(tag);
  if (!match) {
    throw new Error(
      `"${tag}" is not a release-candidate tag. Expected v<major>.<minor>.<patch>-rc.<n>, e.g. v1.1.1-rc.1`,
    );
  }
  return { version: match[1], rc: Number(match[2]), finalTag: `v${match[1]}` };
}

/**
 * Release build number: unique and increasing for every release build attempt.
 * GitHub run numbers only grow for a workflow; the attempt digit separates re-runs.
 *   1000 + runNumber * 10 + attempt   (attempt 1..9)
 */
function computeReleaseBuildNumber(runNumber, runAttempt) {
  const run = Number(runNumber);
  const attempt = Number(runAttempt);
  if (!Number.isInteger(run) || run < 1) {
    throw new Error(`Invalid run number: ${runNumber}`);
  }
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > 9) {
    throw new Error(`Run attempt ${runAttempt} is out of range 1-9; start a new run instead.`);
  }
  const buildNumber = RELEASE_BUILD_BASE + run * 10 + attempt;
  if (buildNumber > MAX_VERSION_CODE) {
    throw new Error(`Build number ${buildNumber} exceeds the Android limit ${MAX_VERSION_CODE}`);
  }
  return buildNumber;
}

/**
 * Guard against a reused or lower build number, e.g. if the workflow file was
 * renamed and its run counter restarted. `previous` are build numbers already
 * recorded in GitHub Releases.
 */
function assertBuildNumberIncreases(buildNumber, previous) {
  const highest = previous.length ? Math.max(...previous) : 0;
  if (buildNumber <= highest) {
    throw new Error(
      `Build number ${buildNumber} is not greater than the highest released build ${highest}. ` +
        'Release builds must have unique, increasing build numbers.',
    );
  }
  return highest;
}

/** Extracts "(build 1031)" from GitHub Release titles. */
function buildNumbersFromReleaseTitles(titles) {
  return titles
    .map(title => /\(build (\d+)\)/.exec(title))
    .filter(Boolean)
    .map(match => Number(match[1]));
}

/** iOS marketing version as stored in the Xcode project (all build configurations). */
function readIosMarketingVersions(pbxprojText) {
  return [...pbxprojText.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1].trim());
}

/**
 * The app version lives in package.json. The Android build reads it directly;
 * the iOS project must match it. Returns a list of problems (empty = consistent).
 */
function checkVersionConsistency({ packageVersion, iosMarketingVersions, tagVersion }) {
  const problems = [];
  if (!isSemver(packageVersion)) {
    problems.push(`package.json version "${packageVersion}" is not MAJOR.MINOR.PATCH`);
  }
  if (iosMarketingVersions.length === 0) {
    problems.push('No MARKETING_VERSION found in the iOS project');
  }
  for (const v of new Set(iosMarketingVersions)) {
    if (v !== packageVersion) {
      problems.push(
        `iOS MARKETING_VERSION is ${v} but package.json is ${packageVersion} (run: npm run version:set ${packageVersion})`,
      );
    }
  }
  if (tagVersion !== undefined && tagVersion !== packageVersion) {
    problems.push(`Tag version ${tagVersion} does not match package.json version ${packageVersion}`);
  }
  return problems;
}

function setIosMarketingVersion(pbxprojText, version) {
  return pbxprojText.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`);
}

function sha256File(path) {
  return crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex');
}

/** Parses `sha256sum` output ("<hash>  <file>") into { file: hash }. */
function parseSha256Sums(text) {
  const sums = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match) {
      sums[match[2]] = match[1];
    }
  }
  return sums;
}

/** Parses `aapt2 dump badging` output for the values actually inside the APK. */
function parseApkBadging(text) {
  const match = /package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'/.exec(text);
  if (!match) {
    throw new Error('Could not read package name and version from the APK');
  }
  return { applicationId: match[1], versionCode: Number(match[2]), versionName: match[3] };
}

/** The immutable description of one release-candidate binary. */
function createManifest(input) {
  return {
    schema: 'equipdemo.release-manifest/v1',
    app: 'equipDemo',
    version: input.version,
    buildNumber: input.buildNumber,
    releaseCandidate: { tag: input.rcTag, number: input.rc },
    platforms: {
      android: {
        applicationId: input.apk.applicationId,
        versionName: input.apk.versionName,
        versionCode: input.apk.versionCode,
        variant: 'release',
        signing: 'Android debug key (internal distribution only)',
      },
      ios: {
        bundleShortVersion: input.version,
        bundleVersion: input.buildNumber,
        built: false,
        note: 'iOS is not built in CI yet; these are the values an iOS build of this candidate must use.',
      },
    },
    source: {
      repository: input.repository,
      commit: input.commit,
      ref: input.ref,
    },
    build: {
      timestamp: input.timestamp,
      workflow: input.workflow,
      runId: input.runId,
      runNumber: input.runNumber,
      runAttempt: input.runAttempt,
      runUrl: input.runUrl,
      toolchain: input.toolchain,
    },
    artifact: {
      file: input.artifactFile,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
      ciArtifactName: input.ciArtifactName,
      ciRetentionDays: input.ciRetentionDays,
    },
    configuration: {
      dataSource: 'demo data (no backend configuration is built into release candidates)',
    },
  };
}

/**
 * Verifies an artifact against its manifest and checksum file. Returns a list
 * of problems (empty = verified). Never trusts a single source on its own.
 */
function verifyArtifact({ manifest, apkPath, sha256SumsText, expected = {} }) {
  const problems = [];
  const actual = sha256File(apkPath);
  const fileName = require('path').basename(apkPath);

  if (fileName !== manifest.artifact.file) {
    problems.push(`File name ${fileName} does not match manifest ${manifest.artifact.file}`);
  }
  if (actual !== manifest.artifact.sha256) {
    problems.push(`SHA-256 of ${fileName} is ${actual}, manifest says ${manifest.artifact.sha256}`);
  }
  if (sha256SumsText !== undefined) {
    const listed = parseSha256Sums(sha256SumsText)[fileName];
    if (!listed) {
      problems.push(`${fileName} is not listed in SHA256SUMS.txt`);
    } else if (listed !== actual) {
      problems.push(`SHA256SUMS.txt lists ${listed} for ${fileName}, actual is ${actual}`);
    }
  }
  if (fs.statSync(apkPath).size !== manifest.artifact.sizeBytes) {
    problems.push(`Size of ${fileName} does not match the manifest`);
  }
  for (const [key, value] of Object.entries(expected)) {
    const recorded = key === 'commit' ? manifest.source.commit : manifest[key];
    if (recorded !== value) {
      problems.push(`Manifest ${key} is ${recorded}, expected ${value}`);
    }
  }
  return { sha256: actual, problems };
}

/** Starts the append-only release record for a new candidate (stage DEV). */
function createReleaseRecord(manifest, candidateEntry) {
  const dev = getStage('DEV');
  return {
    schema: 'equipdemo.release-record/v1',
    app: manifest.app,
    version: manifest.version,
    buildNumber: manifest.buildNumber,
    releaseCandidate: manifest.releaseCandidate.tag,
    source: { repository: manifest.source.repository, commit: manifest.source.commit },
    artifact: { file: manifest.artifact.file, sha256: manifest.artifact.sha256 },
    stages: [
      {
        stage: 'DEV',
        kind: dev.kind,
        deployment: dev.deployment,
        checks: dev.requiredChecks.map(name => ({ name, result: 'passed' })),
        ...candidateEntry,
        artifactSha256: manifest.artifact.sha256,
      },
    ],
  };
}

/**
 * Checks that `stage` may be recorded next for this record and binary.
 * Enforces stage order (no skipping, no repeats) and that the binary is
 * byte-for-byte the candidate (same SHA-256): no rebuilds between stages.
 */
function assertCanPromote(record, stage, artifactSha256) {
  const index = STAGES.indexOf(stage);
  if (index < 1) {
    throw new Error(`Unknown promotion stage "${stage}". Use one of: ${STAGES.slice(1).join(', ')}`);
  }
  const done = record.stages.map(s => s.stage);
  if (done.includes(stage)) {
    throw new Error(`${record.releaseCandidate} has already been promoted to ${stage}`);
  }
  const required = STAGES[index - 1];
  if (done[done.length - 1] !== required) {
    throw new Error(
      `${stage} requires ${required} to be the last recorded stage; ${record.releaseCandidate} is at ${done[done.length - 1]}`,
    );
  }
  if (artifactSha256 !== record.artifact.sha256) {
    throw new Error('Artifact checksum differs from the candidate; refusing to promote a different binary');
  }
}

/** Appends a stage entry after the same checks as assertCanPromote. */
function appendStage(record, entry) {
  assertCanPromote(record, entry.stage, entry.artifactSha256);
  return { ...record, stages: [...record.stages, entry] };
}

/**
 * Compares two release records (e.g. Version 1 and Version 2). Returns a table
 * of differences and a list of consistency findings; `problems` is empty when
 * the newer record is a proper successor (new binary, higher build number,
 * same gates passed, one binary per record).
 */
function compareRecords(older, newer) {
  const stageNames = r => r.stages.map(s => s.stage);
  const kinds = r => r.stages.map(s => `${s.stage}:${s.kind || '-'}`).join(' → ');
  const approvers = r => [...new Set(r.stages.flatMap(s => s.approvedBy || []))].join(', ') || '-';
  const rows = [
    ['App version', older.version, newer.version],
    ['Build number', older.buildNumber, newer.buildNumber],
    ['Release candidate', older.releaseCandidate, newer.releaseCandidate],
    ['Source commit', older.source.commit, newer.source.commit],
    ['Artifact', older.artifact.file, newer.artifact.file],
    ['SHA-256', older.artifact.sha256, newer.artifact.sha256],
    ['Stages', kinds(older), kinds(newer)],
    ['Approvers', approvers(older), approvers(newer)],
    ['First stage at', older.stages[0]?.at, newer.stages[0]?.at],
    ['Last stage at', older.stages.at(-1)?.at, newer.stages.at(-1)?.at],
  ];
  const problems = [];
  const findings = [];
  const check = (ok, good, bad) => (ok ? findings.push(good) : problems.push(bad));
  check(newer.version !== older.version, 'Different app version', 'Same app version');
  check(newer.buildNumber > older.buildNumber, 'Build number increased', 'Build number did not increase');
  check(newer.artifact.sha256 !== older.artifact.sha256, 'New binary (different SHA-256)', 'Same binary as before');
  check(newer.source.commit !== older.source.commit, 'Different source commit', 'Same source commit');
  for (const [label, r] of [['older', older], ['newer', newer]]) {
    check(
      r.stages.every(s => s.artifactSha256 === r.artifact.sha256),
      `${label}: one binary through every stage`,
      `${label}: a stage recorded a different SHA-256`,
    );
  }
  const same = JSON.stringify(stageNames(older)) === JSON.stringify(stageNames(newer));
  check(same, `Same release gates passed: ${stageNames(newer).join(' → ')}`, `Different gates: ${stageNames(older).join(' → ')} vs ${stageNames(newer).join(' → ')}`);
  return { rows, findings, problems };
}

module.exports = {
  compareRecords,
  RELEASE_BUILD_BASE,
  STAGES,
  appendStage,
  assertBuildNumberIncreases,
  assertCanPromote,
  buildNumbersFromReleaseTitles,
  checkVersionConsistency,
  computeReleaseBuildNumber,
  createManifest,
  createReleaseRecord,
  isSemver,
  parseApkBadging,
  parseRcTag,
  parseSha256Sums,
  readIosMarketingVersions,
  setIosMarketingVersion,
  sha256File,
  verifyArtifact,
};
