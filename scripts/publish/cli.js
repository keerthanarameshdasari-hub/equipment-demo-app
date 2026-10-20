#!/usr/bin/env node
/**
 * equipDemo publishing CLI (used by publish.yml; runnable locally).
 *
 *   node scripts/publish/cli.js metadata --out FILE --application-id ID --track T --rollout N --notes TEXT
 *   node scripts/publish/cli.js <operation> --target mock|google-play|app-store-connect
 *        --dir RELEASE_DIR --metadata FILE --log FILE [--state FILE] [--approved-by a,b] [--build-id ID]
 *
 * Operations: validate, upload, assign-track, request-review, start-rollout, status
 * Every outcome (including refusals) is appended to --log as evidence.
 * Exit codes: 0 ok, 2 rejected/invalid, 3 disabled or credentials missing, 4 not implemented, 1 other.
 */
'use strict';

const fs = require('fs');
const { createPublisher } = require('./index');
const { loadContext } = require('./validation');
const { PublishError } = require('./interface');

const OPERATION_METHODS = {
  validate: 'validateArtifact',
  upload: 'uploadBuild',
  'assign-track': 'assignTrack',
  'request-review': 'requestReview',
  'start-rollout': 'startRollout',
  status: 'getStatus',
};
const EXIT_CODES = { rejected: 2, invalid_state: 2, disabled: 3, credentials_missing: 3, not_implemented: 4 };

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    } else {
      args._.push(argv[i]);
    }
  }
  return args;
}

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));

function appendLog(file, entry) {
  if (!file) {
    return;
  }
  const log = fs.existsSync(file) ? readJson(file) : [];
  log.push(entry);
  fs.writeFileSync(file, JSON.stringify(log, null, 2) + '\n');
}

/** The build uploaded earlier in this log, so later operations need no --build-id. */
function lastBuildId(logFile) {
  if (!logFile || !fs.existsSync(logFile)) {
    return undefined;
  }
  const upload = readJson(logFile)
    .filter(e => e.operation === 'uploadBuild' && e.details?.buildId)
    .pop();
  return upload?.details.buildId;
}

function writeMetadata(args) {
  const rollout = Number(args.rollout);
  const metadata = {
    applicationId: args['application-id'],
    track: args.track,
    rolloutPercentage: Number.isFinite(rollout) ? rollout : args.rollout,
    releaseNotes: { 'en-US': args.notes ?? '' },
  };
  fs.writeFileSync(args.out, JSON.stringify(metadata, null, 2) + '\n');
  console.log(JSON.stringify(metadata, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (command === 'metadata') {
    return writeMetadata(args);
  }
  const method = OPERATION_METHODS[command];
  if (!method) {
    throw new Error(`Unknown operation "${command}". Use: metadata, ${Object.keys(OPERATION_METHODS).join(', ')}`);
  }

  const target = args.target || 'mock';
  const publisher = createPublisher(target, { stateFile: args.state });
  const ctx = loadContext({
    dir: args.dir,
    metadata: args.metadata ? readJson(args.metadata) : {},
    publishApprovedBy: (args['approved-by'] || '').split(','),
  });
  const buildId = args['build-id'] || lastBuildId(args.log);

  try {
    const result = await publisher[method](ctx, buildId);
    appendLog(args.log, result);
    const label = result.simulated ? 'SIMULATED' : 'REAL';
    console.log(`✓ [${label}] ${method}: ${result.status}`);
    console.log(JSON.stringify(result.details, null, 2));
    if (result.disclaimer) {
      console.log(result.disclaimer);
    }
  } catch (error) {
    if (!(error instanceof PublishError)) {
      throw error;
    }
    appendLog(args.log, {
      operation: method,
      adapter: target,
      simulated: publisher.simulated,
      storeContacted: false,
      status: 'FAILED',
      code: error.code,
      problems: error.problems,
      message: error.message,
      at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    });
    console.error(`✗ ${method} refused (${error.code}): ${error.message}`);
    process.exitCode = EXIT_CODES[error.code] || 1;
  }
}

main().catch(error => {
  console.error(`✗ ${error.message}`);
  process.exitCode = 1;
});
