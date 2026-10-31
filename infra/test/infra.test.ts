import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { parse, type ScalarTag, type CollectionTag } from 'yaml';

const INFRA = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = resolve(INFRA, '..');
const read = (path: string) => readFileSync(join(INFRA, path), 'utf8');

// CloudFormation short-form intrinsics (!Ref, !Sub, ...) as plain objects.
const CFN_FUNCTIONS = ['Ref', 'Sub', 'GetAtt', 'If', 'Equals', 'Not', 'And', 'Or', 'Join', 'Select', 'Split', 'FindInMap', 'Base64', 'Cidr', 'ImportValue', 'GetAZs', 'Condition'];
const cfnTags = CFN_FUNCTIONS.flatMap(name => {
  const key = name === 'Ref' || name === 'Condition' ? name : `Fn::${name}`;
  const scalar: ScalarTag = { tag: `!${name}`, resolve: (value: string) => ({ [key]: value }) };
  const seq: CollectionTag = { tag: `!${name}`, collection: 'seq', resolve: value => ({ [key]: (value as { toJSON(): unknown }).toJSON() }) };
  const map: CollectionTag = { tag: `!${name}`, collection: 'map', resolve: value => ({ [key]: (value as { toJSON(): unknown }).toJSON() }) };
  return [scalar, seq, map];
});

const SECRET_LIKE = /(password|secret|token|private[_-]?key|access[_-]?key)/i;

describe('compose.yaml (local stack)', () => {
  const compose = parse(read('compose.yaml'), { merge: true }) as {
    services: Record<string, { ports?: string[]; environment?: Record<string, unknown>; build?: { context: string; dockerfile: string } }>;
  };

  test('publishes ports on loopback only', () => {
    for (const [name, service] of Object.entries(compose.services)) {
      for (const mapping of service.ports ?? []) {
        expect([name, mapping.startsWith('127.0.0.1:')]).toEqual([name, true]);
      }
    }
  });

  test('contains no literal credentials: every secret-like value is interpolated', () => {
    for (const [name, service] of Object.entries(compose.services)) {
      for (const [key, value] of Object.entries(service.environment ?? {})) {
        const text = String(value);
        if (SECRET_LIKE.test(key) || /:\/\/[^@/\s]+:[^@/\s]+@/.test(text)) {
          expect([name, key, /\$\{POSTGRES_PASSWORD:\?/.test(text)]).toEqual([name, key, true]);
        }
      }
    }
  });

  test('runs migrations once, before api and worker', () => {
    expect(compose.services.migrate?.build?.dockerfile).toBe('infra/docker/api.Dockerfile');
    for (const name of ['api', 'worker']) {
      const deps = (compose.services[name] as { depends_on?: Record<string, { condition: string }> }).depends_on;
      expect(deps?.migrate?.condition).toBe('service_completed_successfully');
    }
  });

  test('build definitions point at files that exist', () => {
    for (const service of Object.values(compose.services)) {
      if (service.build) {
        expect(existsSync(resolve(INFRA, service.build.context, service.build.dockerfile))).toBe(true);
      }
    }
  });
});

describe('Dockerfiles', () => {
  const files = readdirSync(join(INFRA, 'docker')).filter(f => f.endsWith('.Dockerfile'));

  test.each(files)('%s runs as a non-root user and bakes in no secrets', file => {
    const text = read(join('docker', file));
    const stages = text.split(/^FROM /m);
    const runtime = stages[stages.length - 1]!;
    expect(runtime).toMatch(/^USER node$/m);
    for (const line of text.split('\n').filter(l => /^(ARG|ENV)\s/.test(l))) {
      expect([file, line, SECRET_LIKE.test(line)]).toEqual([file, line, false]);
    }
  });

  test.each(files)('%s copies only paths that exist in the repository', file => {
    const text = read(join('docker', file));
    for (const match of text.matchAll(/^COPY (?!--from)(?:--\S+ )*(.+) \S+$/gm)) {
      for (const source of match[1]!.split(' ')) {
        expect([file, source, existsSync(join(REPO, source))]).toEqual([file, source, true]);
      }
    }
  });

  test('the build context excludes local env files and dependencies', () => {
    const ignore = readFileSync(join(REPO, '.dockerignore'), 'utf8').split('\n');
    for (const entry of ['**/node_modules', '.env', '.env.*', '**/.env', '.git']) {
      expect(ignore).toContain(entry);
    }
  });
});

describe('AWS CloudFormation templates', () => {
  const templates = readdirSync(join(INFRA, 'aws')).filter(f => f.endsWith('.yaml'));
  const load = (file: string) => parse(read(join('aws', file)), { customTags: cfnTags }) as Record<string, any>;

  test.each(templates)('%s parses and declares resources', file => {
    const template = load(file);
    expect(template.AWSTemplateFormatVersion).toBe('2010-09-09');
    expect(Object.keys(template.Resources ?? {}).length).toBeGreaterThan(0);
  });

  test.each(templates)('%s creates no long-lived IAM access keys', file => {
    const types = Object.values(load(file).Resources as Record<string, { Type: string }>).map(r => r.Type);
    expect(types).not.toContain('AWS::IAM::AccessKey');
    expect(types).not.toContain('AWS::IAM::User');
  });

  test('the GitHub OIDC role trusts one repository environment and the STS audience only', () => {
    const template = load('secrets-demo-oidc.yaml');
    const role = Object.values(template.Resources as Record<string, any>).find(r => r.Type === 'AWS::IAM::Role');
    const statement = role.Properties.AssumeRolePolicyDocument.Statement[0];
    expect(statement.Action).toBe('sts:AssumeRoleWithWebIdentity');
    const condition = statement.Condition.StringEquals;
    expect(condition['token.actions.githubusercontent.com:aud']).toBe('sts.amazonaws.com');
    expect(condition['token.actions.githubusercontent.com:sub']).toEqual({
      'Fn::Sub': 'repo:${GitHubOwner}/${GitHubRepo}:environment:${GitHubEnvironment}',
    });
  });
});
