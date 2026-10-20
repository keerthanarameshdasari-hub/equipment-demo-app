const fs = require('fs');
const os = require('os');
const path = require('path');
const { describe, expect, test } = require('@jest/globals');
const lib = require('../scripts/release/lib');

describe('version conventions', () => {
  test('parses release-candidate tags', () => {
    expect(lib.parseRcTag('v1.1.1-rc.2')).toEqual({ version: '1.1.1', rc: 2, finalTag: 'v1.1.1' });
    for (const bad of ['v1.1.1', '1.1.1-rc.1', 'v1.1-rc.1', 'v1.1.1-rc.0', 'v1.1.1-beta.1']) {
      expect(() => lib.parseRcTag(bad)).toThrow(/not a release-candidate tag/);
    }
  });

  test('flags inconsistent versions', () => {
    expect(
      lib.checkVersionConsistency({ packageVersion: '1.1.1', iosMarketingVersions: ['1.1.1', '1.1.1'], tagVersion: '1.1.1' }),
    ).toEqual([]);
    const problems = lib.checkVersionConsistency({
      packageVersion: '1.1.1',
      iosMarketingVersions: ['1.0'],
      tagVersion: '1.2.0',
    });
    expect(problems).toHaveLength(2);
    expect(problems.join(' ')).toMatch(/iOS MARKETING_VERSION is 1.0/);
    expect(problems.join(' ')).toMatch(/Tag version 1.2.0/);
  });

  test('updates the iOS marketing version in every build configuration', () => {
    const pbx = 'a MARKETING_VERSION = 1.0; b MARKETING_VERSION = 1.0;';
    expect(lib.readIosMarketingVersions(lib.setIosMarketingVersion(pbx, '2.0.0'))).toEqual(['2.0.0', '2.0.0']);
  });
});

describe('release build numbers', () => {
  test('are unique and increase across runs and re-run attempts', () => {
    const numbers = [
      lib.computeReleaseBuildNumber(1, 1),
      lib.computeReleaseBuildNumber(1, 2),
      lib.computeReleaseBuildNumber(2, 1),
      lib.computeReleaseBuildNumber(12, 3),
    ];
    expect(numbers).toEqual([1011, 1012, 1021, 1123]);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every(n => n > lib.RELEASE_BUILD_BASE)).toBe(true);
  });

  test('rejects more than 9 attempts', () => {
    expect(() => lib.computeReleaseBuildNumber(5, 10)).toThrow(/out of range/);
  });

  test('must exceed every build number already released', () => {
    const titles = ['equipDemo 1.1.1-rc.1 (build 1031)', 'equipDemo 1.1.1 (build 1031)', 'Notes'];
    const previous = lib.buildNumbersFromReleaseTitles(titles);
    expect(previous).toEqual([1031, 1031]);
    expect(() => lib.assertBuildNumberIncreases(1031, previous)).toThrow(/not greater/);
    expect(lib.assertBuildNumberIncreases(1041, previous)).toBe(1031);
  });

  test('reads the identity from aapt2 output', () => {
    const line =
      "package: name='com.equipmentdemo.app' versionCode='1031' versionName='1.1.1' compileSdkVersionCodename='16'";
    expect(lib.parseApkBadging(line)).toEqual({
      applicationId: 'com.equipmentdemo.app',
      versionCode: 1031,
      versionName: '1.1.1',
    });
  });
});

describe('manifest, verification and promotion', () => {
  function makeCandidate() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
    const file = 'equipdemo-v1.1.1-rc.1-build1031.apk';
    fs.writeFileSync(path.join(dir, file), 'pretend this is an APK');
    const sha256 = lib.sha256File(path.join(dir, file));
    const manifest = lib.createManifest({
      version: '1.1.1',
      buildNumber: 1031,
      rcTag: 'v1.1.1-rc.1',
      rc: 1,
      apk: { applicationId: 'com.equipmentdemo.app', versionName: '1.1.1', versionCode: 1031 },
      repository: 'owner/repo',
      commit: 'a'.repeat(40),
      ref: 'refs/tags/v1.1.1-rc.1',
      timestamp: '2026-10-20T00:00:00Z',
      runId: 1,
      artifactFile: file,
      sizeBytes: fs.statSync(path.join(dir, file)).size,
      sha256,
    });
    const sums = `${sha256}  ${file}\n`;
    return { dir, file, sha256, manifest, sums };
  }

  test('manifest records version, build number, commit, timestamp and checksum', () => {
    const { manifest, sha256 } = makeCandidate();
    expect(manifest).toMatchObject({
      version: '1.1.1',
      buildNumber: 1031,
      source: { commit: 'a'.repeat(40) },
      build: { timestamp: '2026-10-20T00:00:00Z' },
      artifact: { sha256 },
      platforms: { android: { versionCode: 1031, versionName: '1.1.1' }, ios: { bundleVersion: 1031 } },
    });
  });

  test('an untouched artifact verifies', () => {
    const { dir, file, manifest, sums } = makeCandidate();
    const result = lib.verifyArtifact({
      manifest,
      apkPath: path.join(dir, file),
      sha256SumsText: sums,
      expected: { commit: 'a'.repeat(40), version: '1.1.1' },
    });
    expect(result.problems).toEqual([]);
  });

  test('a modified artifact, wrong commit or wrong version is rejected', () => {
    const { dir, file, manifest, sums } = makeCandidate();
    fs.appendFileSync(path.join(dir, file), 'x');
    const { problems } = lib.verifyArtifact({
      manifest,
      apkPath: path.join(dir, file),
      sha256SumsText: sums,
      expected: { commit: 'b'.repeat(40), version: '1.2.0' },
    });
    expect(problems.join('\n')).toMatch(/SHA-256 of .* is/);
    expect(problems.join('\n')).toMatch(/SHA256SUMS.txt lists/);
    expect(problems.join('\n')).toMatch(/Manifest commit/);
    expect(problems.join('\n')).toMatch(/Manifest version/);
  });

  test('stages are appended in order, for the same binary only', () => {
    const { manifest, sha256 } = makeCandidate();
    let record = lib.createReleaseRecord(manifest, { at: 't0', by: 'release workflow' });
    const entry = stage => ({ stage, at: 't', by: 'tester', artifactSha256: sha256 });

    expect(() => lib.appendStage(record, entry('approved'))).toThrow(/requires the "qa" stage/);
    expect(() => lib.appendStage(record, { ...entry('qa'), artifactSha256: 'f'.repeat(64) })).toThrow(
      /different binary/,
    );
    record = lib.appendStage(record, entry('qa'));
    expect(() => lib.appendStage(record, entry('qa'))).toThrow(/already been promoted/);
    record = lib.appendStage(record, entry('approved'));
    expect(record.stages.map(s => s.stage)).toEqual(['candidate', 'qa', 'approved']);
    expect(new Set(record.stages.map(s => s.artifactSha256))).toEqual(new Set([sha256]));
  });
});
