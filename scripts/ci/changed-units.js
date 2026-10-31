#!/usr/bin/env node
// Path-aware CI: which units does a change affect?
//
//   node scripts/ci/changed-units.js --base <sha> --head <sha>   # pull requests
//   node scripts/ci/changed-units.js --all                        # push to main, manual, release
//   node scripts/ci/changed-units.js --files a.ts b.ts            # local what-if
//
// A unit is affected when its own files change, when a unit it depends on changes
// (transitively, from the package.json graph), or when a global path changes
// (lockfile, shared tooling, CI). Docs-only changes affect nothing.
// Writes GitHub Actions outputs when GITHUB_OUTPUT is set. No dependencies.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { UNITS, GLOBAL_PATHS, DOC_PATHS } = require('../boundaries/units');

const ROOT = path.resolve(__dirname, '..', '..');

/** unit name -> names of units it depends on (from package.json). */
function dependencyGraph(root = ROOT, units = UNITS) {
  const byPkg = new Map(units.map(u => [u.pkg, u.name]));
  const graph = {};
  for (const unit of units) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, unit.dir, 'package.json'), 'utf8'));
    const deps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    graph[unit.name] = deps.filter(d => byPkg.has(d) && byPkg.get(d) !== unit.name).map(d => byPkg.get(d));
  }
  return graph;
}

function directUnits(files, units = UNITS) {
  const nested = units.filter(u => u.dir !== '.');
  const hit = new Set();
  for (const raw of files) {
    const file = raw.replace(/\\/g, '/');
    if (DOC_PATHS.some(re => re.test(file))) {
      continue;
    }
    if (GLOBAL_PATHS.some(re => re.test(file))) {
      units.forEach(u => hit.add(u.name));
      continue;
    }
    const owner = nested.find(u => file === u.dir || file.startsWith(`${u.dir}/`));
    // Anything outside apps/, packages/ and infra/ belongs to customer-mobile (the repo root).
    hit.add(owner ? owner.name : 'customer-mobile');
  }
  return hit;
}

function affectedUnits(files, graph, units = UNITS) {
  const affected = directUnits(files, units);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [unit, deps] of Object.entries(graph)) {
      if (!affected.has(unit) && deps.some(d => affected.has(d))) {
        affected.add(unit);
        grew = true;
      }
    }
  }
  // Stable order (as declared in units.js).
  return units.map(u => u.name).filter(n => affected.has(n));
}

function summarize(affected, units = UNITS) {
  const workspaces = units.filter(u => u.dir !== '.' && affected.includes(u.name));
  return {
    units: affected,
    matrix: { include: workspaces.map(u => ({ unit: u.name, workspace: u.pkg, dir: u.dir })) },
    customerMobile: affected.includes('customer-mobile'),
    backend: affected.includes('api') || affected.includes('worker'),
    images: ['api', 'worker'].filter(n => affected.includes(n) || affected.includes('infra')),
  };
}

function parseArgs(argv) {
  const args = { all: false, files: null, base: null, head: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--all') args.all = true;
    else if (argv[i] === '--base') args.base = argv[++i];
    else if (argv[i] === '--head') args.head = argv[++i];
    else if (argv[i] === '--files') args.files = argv.slice(i + 1);
  }
  return args;
}

module.exports = { dependencyGraph, directUnits, affectedUnits, summarize };

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  let files;
  if (args.all || (!args.files && !args.base)) {
    files = ['package.json']; // a global path: everything runs
  } else if (args.files) {
    files = args.files;
  } else {
    const out = execFileSync('git', ['diff', '--name-only', args.base, args.head || 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    files = out.split('\n').filter(Boolean);
  }
  const result = summarize(affectedUnits(files, dependencyGraph()));
  console.log(`Changed files: ${files.length}${args.all ? ' (all units requested)' : ''}`);
  console.log(`Affected units: ${result.units.join(', ') || 'none'}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      [
        `units=${JSON.stringify(result.units)}`,
        `matrix=${JSON.stringify(result.matrix)}`,
        `has_workspaces=${result.matrix.include.length > 0}`,
        `customer_mobile=${result.customerMobile}`,
        `backend=${result.backend}`,
        `images=${JSON.stringify(result.images)}`,
        `has_images=${result.images.length > 0}`,
      ].join('\n') + '\n',
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Affected units\n\n${result.units.map(u => `- ${u}`).join('\n') || 'None (documentation only)'}\n`);
  }
}
