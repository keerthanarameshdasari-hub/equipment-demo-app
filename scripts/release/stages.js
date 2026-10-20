/**
 * The six release stages of equipDemo: the single source of truth used by the
 * promotion workflow, the release record and docs/STAGES.md.
 *
 * `kind` says honestly what a stage is in this demo:
 *   actual    - the checks and the result are real
 *   simulated - no separate environment exists; the stage is a labelled stand-in
 */
'use strict';

const STAGE_DEFINITIONS = [
  {
    name: 'DEV',
    purpose: 'Integrate code changes continuously and produce the release candidate.',
    kind: 'actual',
    deployment: 'ACTUAL: CI on every pull request and push to main; the candidate is built by release.yml.',
    backend: 'None: tests use the in-memory mock data source; APKs use built-in demo data.',
    requiredChecks: ['Secret-file guard', 'Version consistency', 'ESLint', 'TypeScript', 'Unit and UI tests', 'APK build'],
    entry: 'A pull request to main, or an RC tag pushed for a version not yet released.',
    exit: 'All CI checks green; RC built, identity read back from the APK, manifest and checksum stored.',
    approver: null,
    evidence: 'CI run, test reports, release-manifest.json, SHA256SUMS.txt, GitHub pre-release.',
  },
  {
    name: 'SIT',
    purpose: 'System integration: prove the candidate\'s code works against a real backend.',
    kind: 'simulated',
    deployment:
      'SIMULATED environment: no separate SIT backend exists, so the SIT environment points at the shared demo ' +
      'Supabase project. The integration checks themselves are ACTUAL.',
    backend: 'Supabase (SIT environment variables; shared demo project).',
    requiredChecks: [
      'Artifact integrity (manifest, SHA256SUMS, CI copy, tagged commit)',
      'Live Supabase integration tests at the candidate commit (read, write, RLS, constraints)',
    ],
    entry: 'DEV recorded for this candidate.',
    exit: 'All integration tests pass.',
    approver: null,
    evidence: 'Integration test report, release-record entry.',
  },
  {
    name: 'QA',
    purpose: 'Functional quality: verify the exact binary and its behaviour before business review.',
    kind: 'simulated',
    deployment:
      'SIMULATED deployment: there is no QA device farm. The tester installs the APK from the GitHub pre-release. ' +
      'The automated binary and test checks are ACTUAL.',
    backend: 'None for automated checks (mock data source); the APK uses built-in demo data.',
    requiredChecks: [
      'Artifact integrity',
      'Full unit and UI test suite at the candidate commit',
      'APK inspection: app ID, versionName and versionCode match the manifest; JS bundle present',
      'Manual QA test notes from the approver',
    ],
    entry: 'SIT recorded.',
    exit: 'Automated checks pass and a QA approver signs off with test notes.',
    approver: 'QA lead (demo: repository owner)',
    evidence: 'Test report, APK inspection output, approval with notes.',
  },
  {
    name: 'UAT',
    purpose: 'User acceptance: business owner confirms the release meets requirements.',
    kind: 'simulated',
    deployment: 'SIMULATED: no separate UAT environment or user group. Acceptance is recorded as the approver\'s notes.',
    backend: 'None (acceptance is performed on the same binary).',
    requiredChecks: ['Artifact integrity', 'Acceptance notes from the approver'],
    entry: 'QA recorded.',
    exit: 'Business approver accepts with notes.',
    approver: 'Product owner (demo: repository owner)',
    evidence: 'Approval with acceptance notes.',
  },
  {
    name: 'PRE-PROD',
    purpose: 'Production rehearsal: confirm the backend the release depends on is ready and locked down.',
    kind: 'simulated',
    deployment:
      'SIMULATED environment: points at the shared demo Supabase project (no separate pre-production database). ' +
      'The readiness checks are ACTUAL.',
    backend: 'Supabase (PRE-PROD environment variables; shared demo project).',
    requiredChecks: [
      'Artifact integrity',
      'Backend readiness at the candidate commit: read, write, RLS blocks update/delete, constraints reject bad data',
    ],
    entry: 'UAT recorded.',
    exit: 'Readiness checks pass and the release manager approves.',
    approver: 'Release manager (demo: repository owner)',
    evidence: 'Readiness test report, approval.',
  },
  {
    name: 'PROD',
    purpose: 'Release: mark the candidate as the approved production version.',
    kind: 'actual',
    deployment:
      'ACTUAL: final tag and GitHub Release with the identical binary. Store publishing is SIMULATED, ' +
      'disabled by default, and runs only when explicitly requested and enabled for PROD.',
    backend: 'Supabase (PROD environment variables; read-only smoke check, no writes).',
    requiredChecks: ['Artifact integrity', 'Read-only production smoke check (no data written)'],
    entry: 'PRE-PROD recorded.',
    exit: 'Approved; final tag and release created from the same files.',
    approver: 'Release manager + product owner (demo: repository owner)',
    evidence: 'Final GitHub Release, complete release-record.json, (simulated) store submission receipt if requested.',
  },
];

const STAGES = STAGE_DEFINITIONS.map(s => s.name);
/** Stages reached through promote.yml (DEV is recorded by the release build). */
const PROMOTION_STAGES = STAGES.slice(1);
/** Stages whose GitHub Environment must have required reviewers. */
const APPROVAL_STAGES = STAGE_DEFINITIONS.filter(s => s.approver).map(s => s.name);

function getStage(name) {
  const stage = STAGE_DEFINITIONS.find(s => s.name === name);
  if (!stage) {
    throw new Error(`Unknown stage "${name}". Stages: ${STAGES.join(' → ')}`);
  }
  return stage;
}

module.exports = { STAGE_DEFINITIONS, STAGES, PROMOTION_STAGES, APPROVAL_STAGES, getStage };
