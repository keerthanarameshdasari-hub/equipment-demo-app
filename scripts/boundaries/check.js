#!/usr/bin/env node
// Dependency-boundary gate: `npm run check:boundaries`.
// Fails when a unit (1) declares or imports another unit it is not allowed to use,
// (2) deep-imports another package's internals, (3) reaches into another unit with a
// relative path, or (4) uses a package banned for its kind (e.g. a frontend importing
// knex/pg/fastify). Rules live in units.js and are documented in docs/MONOREPO.md.
// No dependencies: runs before `npm ci`.
const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');
const { UNITS, ALLOWED_UNIT_DEPS, BANNED_PACKAGES, NODE_BUILTINS_ALLOWED } = require('./units');

const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', 'build', '.git', 'android', 'ios', 'Pods']);
const BUILTINS = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);

// Static `import ... from 'a'` / `import 'a'` / `export ... from 'a'` must start a line (so code
// samples inside string literals are ignored); `import('a')` and `require('a')` may appear anywhere.
const IMPORT_RE = /(?:^[ \t]*import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?|^[ \t]*export\s+(?:type\s+)?[^'"]*?\s+from\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/gm;

// Tests and build tooling run in Node, so built-ins and test runners are fine there.
// Cross-unit rules (which units, deep imports, relative escapes) still apply to them.
const TOOLING_FILE = /(^|[\\/])(__tests__|__integration__|test)[\\/]|\.test\.[cm]?[jt]sx?$|\.config\.[cm]?[jt]s$|(^|[\\/])build\.mjs$/;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) {
    return out;
  }
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (SOURCE_EXT.test(dir)) {
      out.push(dir);
    }
    return out;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) {
      continue;
    }
    walk(path.join(dir, entry.name), out);
  }
  return out;
}

function matches(rules, name) {
  return rules.some(rule => (typeof rule === 'string' ? rule === name : rule.test(name)));
}

/** Package name of a bare specifier: '@scope/pkg/deep' -> '@scope/pkg', 'pkg/deep' -> 'pkg'. */
function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

function checkRepo(root, units = UNITS) {
  const violations = [];
  const byPkg = new Map(units.map(u => [u.pkg, u]));
  const unitDirs = units.filter(u => u.dir !== '.').map(u => path.resolve(root, u.dir));

  for (const unit of units) {
    const unitRoot = path.resolve(root, unit.dir);
    const manifestPath = path.join(unitRoot, 'package.json');
    if (!fs.existsSync(manifestPath)) {
      violations.push(`${unit.name}: missing ${path.relative(root, manifestPath)}`);
      continue;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const declared = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    const allowed = ALLOWED_UNIT_DEPS[unit.kind];

    // 1. Declared dependencies.
    for (const dep of Object.keys(declared)) {
      const target = byPkg.get(dep);
      if (target && !allowed.includes(target.name)) {
        violations.push(`${unit.name}: package.json depends on ${target.name} (${unit.kind} units may use: ${allowed.join(', ') || 'no other units'})`);
      }
      if (!target && unit.kind !== 'shared' && matches(BANNED_PACKAGES[unit.kind], dep)) {
        violations.push(`${unit.name}: package.json depends on "${dep}", which ${unit.kind} units must not use`);
      }
    }
    if (unit.kind === 'shared' && manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
      violations.push(`${unit.name}: shared packages must have no runtime dependencies (found ${Object.keys(manifest.dependencies).join(', ')})`);
    }

    // 2-4. Imports in source files.
    const roots = (unit.sources ?? ['.']).map(s => path.resolve(unitRoot, s));
    const files = roots.flatMap(r => walk(r)).filter(f => unit.dir !== '.' || !unitDirs.some(d => f.startsWith(d + path.sep)));
    for (const file of files) {
      const rel = path.relative(root, file);
      const tooling = TOOLING_FILE.test(rel);
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      for (const match of text.matchAll(IMPORT_RE)) {
        const spec = match[1];
        if (spec.startsWith('.')) {
          const target = path.resolve(path.dirname(file), spec);
          const inOwnUnit = unit.dir === '.'
            ? !unitDirs.some(d => target === d || target.startsWith(d + path.sep))
            : target === unitRoot || target.startsWith(unitRoot + path.sep);
          if (!inOwnUnit) {
            violations.push(`${rel}: relative import "${spec}" leaves the ${unit.name} unit; import the package by name instead`);
          }
          continue;
        }
        if (BUILTINS.has(spec)) {
          if (!tooling && !NODE_BUILTINS_ALLOWED[unit.kind]) {
            violations.push(`${rel}: imports Node built-in "${spec}", not available to ${unit.kind} units`);
          }
          continue;
        }
        const name = packageName(spec);
        const target = byPkg.get(name);
        if (target) {
          if (spec !== name) {
            violations.push(`${rel}: deep import "${spec}"; use the public entry "${name}"`);
          }
          if (target === unit) {
            continue;
          }
          if (!allowed.includes(target.name)) {
            violations.push(`${rel}: imports ${target.name} (${unit.kind} units may use: ${allowed.join(', ') || 'no other units'})`);
          } else if (!(name in declared)) {
            violations.push(`${rel}: imports ${name} but ${unit.name}'s package.json does not declare it`);
          }
          continue;
        }
        if (!tooling && matches(BANNED_PACKAGES[unit.kind], name)) {
          violations.push(`${rel}: imports "${name}", which ${unit.kind} units must not use`);
        }
      }
    }
  }
  return violations;
}

module.exports = { checkRepo, packageName };

if (require.main === module) {
  const root = path.resolve(__dirname, '..', '..');
  const violations = checkRepo(root);
  if (violations.length > 0) {
    console.error(`Dependency boundary violations (${violations.length}):`);
    for (const v of violations) {
      console.error(`  - ${v}`);
      if (process.env.GITHUB_ACTIONS) {
        console.log(`::error title=Dependency boundary::${v}`);
      }
    }
    console.error('Rules: scripts/boundaries/units.js, docs/MONOREPO.md');
    process.exit(1);
  }
  console.log(`✓ Dependency boundaries respected (${UNITS.length} units)`);
}
