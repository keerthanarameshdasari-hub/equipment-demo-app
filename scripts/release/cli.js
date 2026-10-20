#!/usr/bin/env node
/**
 * equipDemo release CLI. Usage:
 *   node scripts/release/cli.js version-check [--tag v1.1.1-rc.1]
 *   node scripts/release/cli.js version-set 1.2.0
 *   node scripts/release/cli.js build-number --run N --attempt A [--previous-titles FILE]
 *   node scripts/release/cli.js manifest --apk FILE --badging FILE --rc-tag TAG --build-number N --out DIR
 *   node scripts/release/cli.js verify DIR [--commit SHA] [--version X.Y.Z]
 *   node scripts/release/cli.js check-stage --record FILE --stage STAGE --sha256 HEX
 *   node scripts/release/cli.js stage-info --stage STAGE
 *   node scripts/release/cli.js compare-records OLDER.json NEWER.json
 *   node scripts/release/cli.js promote --record FILE --stage STAGE --sha256 HEX --by NAME --run-url URL
 *        [--approved-by NAMES] [--checks-file FILE] [--notes TEXT]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const lib = require('./lib');
const { getStage } = require('./stages');

const ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const PACKAGE_LOCK = path.join(ROOT, 'package-lock.json');
const PBXPROJ = path.join(ROOT, 'ios', 'equipDemo.xcodeproj', 'project.pbxproj');

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

function required(args, name) {
  if (args[name] === undefined) {
    throw new Error(`Missing --${name}`);
  }
  return args[name];
}

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

function fail(problems) {
  for (const problem of problems) {
    console.error(`✗ ${problem}`);
  }
  process.exit(1);
}

const commands = {
  'version-check'(args) {
    const tagVersion = args.tag ? lib.parseRcTag(args.tag).version : undefined;
    const packageVersion = readJson(PACKAGE_JSON).version;
    const problems = lib.checkVersionConsistency({
      packageVersion,
      iosMarketingVersions: lib.readIosMarketingVersions(fs.readFileSync(PBXPROJ, 'utf8')),
      tagVersion,
    });
    if (problems.length) {
      fail(problems);
    }
    console.log(`✓ Version ${packageVersion} is consistent (package.json, Android, iOS${args.tag ? ', tag' : ''})`);
  },

  'version-set'(args) {
    const version = args._[1];
    if (!lib.isSemver(version || '')) {
      throw new Error('Usage: version-set MAJOR.MINOR.PATCH');
    }
    const pkg = readJson(PACKAGE_JSON);
    pkg.version = version;
    writeJson(PACKAGE_JSON, pkg);
    const lock = readJson(PACKAGE_LOCK);
    lock.version = version;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = version;
    }
    writeJson(PACKAGE_LOCK, lock);
    fs.writeFileSync(PBXPROJ, lib.setIosMarketingVersion(fs.readFileSync(PBXPROJ, 'utf8'), version));
    console.log(`✓ Version set to ${version} in package.json, package-lock.json and the iOS project`);
  },

  'build-number'(args) {
    const buildNumber = lib.computeReleaseBuildNumber(required(args, 'run'), required(args, 'attempt'));
    const titles = args['previous-titles']
      ? fs.readFileSync(args['previous-titles'], 'utf8').split(/\r?\n/).filter(Boolean)
      : [];
    const highest = lib.assertBuildNumberIncreases(buildNumber, lib.buildNumbersFromReleaseTitles(titles));
    console.error(`Build number ${buildNumber} (highest released so far: ${highest || 'none'})`);
    console.log(buildNumber);
  },

  manifest(args) {
    const env = process.env;
    const apkPath = required(args, 'apk');
    const out = required(args, 'out');
    const { version: tagVersion, rc } = lib.parseRcTag(required(args, 'rc-tag'));
    const buildNumber = Number(required(args, 'build-number'));
    const apk = lib.parseApkBadging(fs.readFileSync(required(args, 'badging'), 'utf8'));
    const version = readJson(PACKAGE_JSON).version;

    // The binary itself must carry the numbers we are about to record.
    const problems = [];
    if (apk.versionName !== version) {
      problems.push(`APK versionName ${apk.versionName} != app version ${version}`);
    }
    if (apk.versionCode !== buildNumber) {
      problems.push(`APK versionCode ${apk.versionCode} != build number ${buildNumber}`);
    }
    if (tagVersion !== version) {
      problems.push(`Tag version ${tagVersion} != app version ${version}`);
    }
    if (problems.length) {
      fail(problems);
    }

    fs.mkdirSync(out, { recursive: true });
    const artifactFile = `equipdemo-v${version}-rc.${rc}-build${buildNumber}.apk`;
    const target = path.join(out, artifactFile);
    fs.copyFileSync(apkPath, target);
    const sha256 = lib.sha256File(target);
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;

    const manifest = lib.createManifest({
      version,
      buildNumber,
      rcTag: args['rc-tag'],
      rc,
      apk,
      repository: env.GITHUB_REPOSITORY,
      commit: env.GITHUB_SHA,
      ref: env.GITHUB_REF,
      timestamp,
      workflow: env.GITHUB_WORKFLOW,
      runId: Number(env.GITHUB_RUN_ID),
      runNumber: Number(env.GITHUB_RUN_NUMBER),
      runAttempt: Number(env.GITHUB_RUN_ATTEMPT),
      runUrl,
      toolchain: {
        node: process.version,
        java: args.java,
        reactNative: readJson(PACKAGE_JSON).dependencies['react-native'],
        runner: env.ImageOS ? `${env.ImageOS} ${env.ImageVersion}` : undefined,
      },
      artifactFile,
      sizeBytes: fs.statSync(target).size,
      sha256,
      ciArtifactName: args['ci-artifact'],
      ciRetentionDays: args['retention-days'] ? Number(args['retention-days']) : undefined,
    });

    writeJson(path.join(out, 'release-manifest.json'), manifest);
    fs.writeFileSync(path.join(out, 'SHA256SUMS.txt'), `${sha256}  ${artifactFile}\n`);
    writeJson(
      path.join(out, 'release-record.json'),
      lib.createReleaseRecord(manifest, { at: timestamp, by: 'release workflow', runUrl }),
    );
    console.log(JSON.stringify({ artifactFile, sha256, buildNumber, version }));
  },

  verify(args) {
    const dir = args._[1];
    if (!dir) {
      throw new Error('Usage: verify DIR [--commit SHA] [--version X.Y.Z]');
    }
    const manifest = readJson(path.join(dir, 'release-manifest.json'));
    const sumsPath = path.join(dir, 'SHA256SUMS.txt');
    const expected = {};
    if (args.commit) {
      expected.commit = args.commit;
    }
    if (args.version) {
      expected.version = args.version;
    }
    const { sha256, problems } = lib.verifyArtifact({
      manifest,
      apkPath: path.join(dir, manifest.artifact.file),
      sha256SumsText: fs.existsSync(sumsPath) ? fs.readFileSync(sumsPath, 'utf8') : undefined,
      expected,
    });
    if (problems.length) {
      fail(problems);
    }
    console.log(`✓ ${manifest.artifact.file}`);
    console.log(`  SHA-256  ${sha256} (matches manifest and SHA256SUMS.txt)`);
    console.log(`  Version  ${manifest.version} (build ${manifest.buildNumber}), ${manifest.releaseCandidate.tag}`);
    console.log(`  Source   ${manifest.source.repository}@${manifest.source.commit}`);
    console.log(`  Built    ${manifest.build.timestamp} by ${manifest.build.runUrl}`);
  },

  'check-stage'(args) {
    const record = readJson(required(args, 'record'));
    lib.assertCanPromote(record, required(args, 'stage'), required(args, 'sha256'));
    const stage = getStage(args.stage);
    console.log(`✓ ${record.releaseCandidate} may enter ${stage.name} (${stage.kind})`);
  },

  'compare-records'(args) {
    const [, olderFile, newerFile] = args._;
    if (!olderFile || !newerFile) {
      throw new Error('Usage: compare-records OLDER_RECORD.json NEWER_RECORD.json');
    }
    const older = readJson(olderFile);
    const newer = readJson(newerFile);
    const { rows, findings, problems } = lib.compareRecords(older, newer);
    const lines = [`| | ${older.version} | ${newer.version} |`, '|---|---|---|'];
    for (const [label, a, b] of rows) {
      lines.push(`| ${label} | ${a === b ? a : `\`${a}\``} | ${a === b ? b : `**\`${b}\`**`} |`);
    }
    console.log(lines.join('\n'));
    console.log('');
    findings.forEach(f => console.log(`- ✓ ${f}`));
    problems.forEach(p => console.log(`- ✗ ${p}`));
    if (problems.length) {
      process.exitCode = 1;
    }
  },

  'stage-info'(args) {
    console.log(JSON.stringify(getStage(required(args, 'stage')), null, 2));
  },

  promote(args) {
    const file = required(args, 'record');
    const stage = getStage(required(args, 'stage'));
    const checks = args['checks-file'] ? readJson(args['checks-file']) : [];
    const failed = checks.filter(c => c.result !== 'passed');
    if (failed.length) {
      throw new Error(`Cannot record ${stage.name}: failed checks: ${failed.map(c => c.name).join(', ')}`);
    }
    const record = lib.appendStage(readJson(file), {
      stage: stage.name,
      kind: stage.kind,
      deployment: stage.deployment,
      backend: stage.backend,
      at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      by: required(args, 'by'),
      approvedBy: args['approved-by'] ? args['approved-by'].split(',').filter(Boolean) : undefined,
      runUrl: required(args, 'run-url'),
      artifactSha256: required(args, 'sha256'),
      verified: true,
      checks,
      notes: args.notes || undefined,
    });
    writeJson(file, record);
    console.log(`✓ ${record.releaseCandidate} recorded at ${stage.name} (${stage.kind})`);
  },
};

try {
  const args = parseArgs(process.argv.slice(2));
  const command = commands[args._[0]];
  if (!command) {
    throw new Error(`Unknown command. Available: ${Object.keys(commands).join(', ')}`);
  }
  command(args);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}
