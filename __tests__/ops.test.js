const { describe, expect, test } = require('@jest/globals');
const { percentile, summarise, toMarkdown } = require('../scripts/ops/ci-report');

const run = (id, name, conclusion, minutes, extra = {}) => ({
  id,
  name,
  status: 'completed',
  conclusion,
  event: 'push',
  head_branch: 'main',
  head_sha: 'abcdef1234567',
  created_at: `2026-10-2${id % 10}T10:00:00Z`,
  run_started_at: '2026-10-21T10:00:00Z',
  updated_at: new Date(Date.parse('2026-10-21T10:00:00Z') + minutes * 60000).toISOString(),
  html_url: `https://example/runs/${id}`,
  ...extra,
});

describe('CI monitoring report', () => {
  test('percentile', () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 90)).toBe(5);
    expect(percentile([], 50)).toBe(0);
  });

  test('counts outcomes, success rate and durations per workflow', () => {
    const s = summarise({
      runs: [run(1, 'CI', 'success', 6), run(2, 'CI', 'failure', 1), run(3, 'CI', 'success', 10), run(4, 'CI', 'cancelled', 2)],
    });
    expect(s.totals).toEqual({ runs: 4, success: 2, failure: 1 });
    expect(s.workflows[0]).toMatchObject({ name: 'CI', runs: 4, success: 2, failure: 1, cancelled: 1, successRate: 67, medianMinutes: 2 });
  });

  test('pinpoints the failing job and step', () => {
    const s = summarise({
      runs: [run(7, 'CI', 'failure', 1)],
      failedJobs: [
        {
          runId: 7,
          jobs: [
            { name: 'Lint, typecheck and test', conclusion: 'failure', steps: [{ name: 'Lint', conclusion: 'success' }, { name: 'Unit and UI tests', conclusion: 'failure' }] },
          ],
        },
      ],
    });
    expect(s.failures[0]).toMatchObject({ workflow: 'CI', job: 'Lint, typecheck and test', step: 'Unit and UI tests', commit: 'abcdef1' });
    expect(s.failuresByStep).toEqual([{ where: 'CI › Lint, typecheck and test › Unit and UI tests', count: 1 }]);
  });

  test('groups Dependabot runs and summarises artifacts without personal data', () => {
    const s = summarise({
      runs: [run(1, 'github_actions in /. - Update #1', 'success', 1, { event: 'dynamic', actor: { login: 'someone' } })],
      artifacts: [
        { name: 'equipdemo-v2.0.0-rc.1-build1052', size_in_bytes: 28 * 1048576, expired: false, created_at: 'c', expires_at: 'e' },
        { name: 'old', size_in_bytes: 1, expired: true },
      ],
    });
    expect(s.workflows[0].name).toBe('Dependabot updates');
    expect(s.artifacts).toMatchObject({ live: 1, totalMB: 28, apks: [{ name: 'equipdemo-v2.0.0-rc.1-build1052', sizeMB: 28 }] });
    expect(JSON.stringify(s)).not.toContain('someone');
    expect(toMarkdown(s)).toContain('Scope: CI/CD pipeline only');
  });
});
