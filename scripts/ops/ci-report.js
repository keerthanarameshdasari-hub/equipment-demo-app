#!/usr/bin/env node
/**
 * CI monitoring report: summarises GitHub Actions results for this repository.
 * Input: JSON fetched with the GitHub API (see .github/workflows/ci-report.yml):
 *   --runs runs.json            GET /repos/{r}/actions/runs        (workflow_runs)
 *   --jobs jobs.json            failed runs' jobs: [{ runId, jobs: [...] }]
 *   --artifacts artifacts.json  GET /repos/{r}/actions/artifacts   (artifacts)
 *   --releases releases.json    GET /repos/{r}/releases
 *   --out DIR                   writes ci-report.md and ci-report.json
 *
 * Scope: CI/CD pipeline health only. It says nothing about the app's runtime
 * behaviour or the backend (see docs/OPERATIONS.md). No personal data is
 * collected: actor logins are excluded.
 */
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
}

const readJson = (file, fallback) => (file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback);
const minutes = ms => Math.round((ms / 60000) * 10) / 10;

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

/** Dependabot runs get a different name per update; group them. */
function workflowName(run) {
  return run.event === 'dynamic' || /^github_actions in /.test(run.name || '') ? 'Dependabot updates' : run.name;
}

/** Pure aggregation, unit-tested in __tests__/ops.test.js. */
function summarise({ runs, failedJobs = [], artifacts = [], releases = [] }) {
  const completed = runs.filter(r => r.status === 'completed');
  const byWorkflow = {};
  for (const run of completed) {
    const name = workflowName(run);
    const w = (byWorkflow[name] ??= { runs: 0, success: 0, failure: 0, cancelled: 0, skipped: 0, durationsMs: [] });
    w.runs += 1;
    const key = ['success', 'failure', 'cancelled'].includes(run.conclusion) ? run.conclusion : 'skipped';
    w[key] += 1;
    const started = Date.parse(run.run_started_at || run.created_at);
    const ended = Date.parse(run.updated_at);
    if (Number.isFinite(started) && Number.isFinite(ended) && ended >= started) {
      w.durationsMs.push(ended - started);
    }
  }
  const workflows = Object.entries(byWorkflow)
    .map(([name, w]) => ({
      name,
      runs: w.runs,
      success: w.success,
      failure: w.failure,
      cancelled: w.cancelled,
      successRate: w.success + w.failure ? Math.round((w.success / (w.success + w.failure)) * 100) : null,
      medianMinutes: minutes(percentile(w.durationsMs, 50)),
      p90Minutes: minutes(percentile(w.durationsMs, 90)),
    }))
    .sort((a, b) => b.runs - a.runs);

  const failures = completed
    .filter(r => r.conclusion === 'failure')
    .map(r => {
      const jobs = (failedJobs.find(j => j.runId === r.id) || { jobs: [] }).jobs;
      const failedJob = jobs.find(j => j.conclusion === 'failure');
      const failedStep = failedJob?.steps?.find(s => s.conclusion === 'failure');
      return {
        workflow: workflowName(r),
        runId: r.id,
        branch: r.head_branch,
        commit: (r.head_sha || '').slice(0, 7),
        at: r.created_at,
        job: failedJob?.name ?? '?',
        step: failedStep?.name ?? '?',
        url: r.html_url,
      };
    });

  const failuresByStep = {};
  for (const f of failures) {
    const key = `${f.workflow} › ${f.job} › ${f.step}`;
    failuresByStep[key] = (failuresByStep[key] || 0) + 1;
  }

  const live = artifacts.filter(a => !a.expired);
  const apkArtifacts = live
    .filter(a => /equipdemo-v/.test(a.name))
    .map(a => ({ name: a.name, sizeMB: Math.round((a.size_in_bytes / 1048576) * 10) / 10, created: a.created_at, expires: a.expires_at }));

  return {
    period: {
      from: completed.map(r => r.created_at).sort()[0] ?? null,
      to: completed.map(r => r.created_at).sort().at(-1) ?? null,
    },
    totals: {
      runs: completed.length,
      success: completed.filter(r => r.conclusion === 'success').length,
      failure: completed.filter(r => r.conclusion === 'failure').length,
    },
    workflows,
    failures,
    failuresByStep: Object.entries(failuresByStep)
      .map(([where, count]) => ({ where, count }))
      .sort((a, b) => b.count - a.count),
    artifacts: {
      live: live.length,
      totalMB: Math.round((live.reduce((s, a) => s + a.size_in_bytes, 0) / 1048576) * 10) / 10,
      apks: apkArtifacts,
    },
    releases: releases.map(r => ({ tag: r.tag_name, name: r.name, prerelease: r.prerelease, published: r.published_at })),
  };
}

function toMarkdown(s) {
  const lines = [];
  lines.push('# CI monitoring report', '');
  lines.push(`Period: ${s.period.from ?? '-'} → ${s.period.to ?? '-'}. Scope: CI/CD pipeline only (not app or backend health).`, '');
  lines.push(`**${s.totals.runs} completed runs: ${s.totals.success} succeeded, ${s.totals.failure} failed.**`, '');
  lines.push('## By workflow', '', '| Workflow | Runs | ✅ | ❌ | Cancelled | Success rate | Median min | p90 min |', '|---|---|---|---|---|---|---|---|');
  for (const w of s.workflows) {
    lines.push(`| ${w.name} | ${w.runs} | ${w.success} | ${w.failure} | ${w.cancelled} | ${w.successRate ?? '-'}% | ${w.medianMinutes} | ${w.p90Minutes} |`);
  }
  lines.push('', '## Where failures happen', '', '| Workflow › job › step | Failures |', '|---|---|');
  for (const f of s.failuresByStep) {
    lines.push(`| ${f.where} | ${f.count} |`);
  }
  lines.push('', '## Recent failures', '', '| When | Workflow | Branch | Commit | Failed job › step |', '|---|---|---|---|---|');
  for (const f of s.failures.slice(0, 15)) {
    lines.push(`| ${f.at} | [${f.workflow}](${f.url}) | ${f.branch} | \`${f.commit}\` | ${f.job} › ${f.step} |`);
  }
  lines.push('', `## Artifacts`, '', `${s.artifacts.live} artifacts stored (${s.artifacts.totalMB} MB).`, '', '| APK artifact | MB | Created | Expires |', '|---|---|---|---|');
  for (const a of s.artifacts.apks.slice(0, 15)) {
    lines.push(`| ${a.name} | ${a.sizeMB} | ${a.created} | ${a.expires} |`);
  }
  lines.push('', '## Releases', '', '| Tag | Name | Type | Published |', '|---|---|---|---|');
  for (const r of s.releases) {
    lines.push(`| ${r.tag} | ${r.name} | ${r.prerelease ? 'candidate' : 'release'} | ${r.published} |`);
  }
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const summary = summarise({
    runs: readJson(args.runs, { workflow_runs: [] }).workflow_runs ?? readJson(args.runs, []),
    failedJobs: readJson(args.jobs, []),
    artifacts: readJson(args.artifacts, { artifacts: [] }).artifacts ?? [],
    releases: readJson(args.releases, []),
  });
  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, 'ci-report.json'), JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(path.join(args.out, 'ci-report.md'), toMarkdown(summary));
  console.log(toMarkdown(summary));
}

module.exports = { summarise, toMarkdown, percentile };
