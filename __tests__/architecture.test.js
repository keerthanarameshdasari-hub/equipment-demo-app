// Guards for the AWS migration seam and for what may enter the mobile bundle.
const fs = require('fs');
const path = require('path');
const { describe, expect, test } = require('@jest/globals');
const { ESLint } = require('eslint');

const ROOT = path.resolve(__dirname, '..');

describe('UI depends only on the repository interface', () => {
  const eslint = new ESLint({ cwd: ROOT });
  const restricted = async (code, filePath) => {
    const [result] = await eslint.lintText(code, { filePath: path.join(ROOT, filePath) });
    return result.messages.filter(m => m.ruleId === 'no-restricted-imports').map(m => m.message);
  };

  test.each([
    ["import { createClient } from '@supabase/supabase-js';", 'src/screens/Bad.tsx'],
    ["import { generateClient } from 'aws-amplify/data';", 'src/screens/Bad.tsx'],
    ["import { createSupabaseClient } from '../data/supabaseClient';", 'src/screens/Bad.tsx'],
    ["import { getSupabaseConfig } from '../config/env';", 'src/ui/Bad.ts'],
    ["import { createClient } from '@supabase/supabase-js';", 'App.tsx'],
  ])('rejects %s in %s', async (code, file) => {
    expect((await restricted(code, file)).join(' ')).toMatch(/EquipmentRepository interface/);
  }, 30000);

  test('allows the interface and its context in the UI', async () => {
    const code = [
      "import { DATA_SOURCE_LABELS } from '../data/EquipmentRepository';",
      "import { useEquipmentRepository } from '../data/RepositoryContext';",
      "import { toUserMessage } from '../data/DataError';",
    ].join('\n');
    expect(await restricted(code, 'src/screens/Ok.tsx')).toEqual([]);
  }, 30000);

  test('data adapters may still use their own SDK', async () => {
    const code = "import { createClient } from '@supabase/supabase-js';";
    expect(await restricted(code, 'src/data/supabaseClient.ts')).toEqual([]);
  }, 30000);

  test('no UI file imports a backend SDK today', () => {
    const uiFiles = ['App.tsx', ...['src/screens', 'src/ui', 'src/navigation', 'src/domain'].flatMap(dir =>
      fs.readdirSync(path.join(ROOT, dir)).map(f => path.join(dir, f)),
    )];
    for (const file of uiFiles) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect([file, /@supabase\/|aws-amplify|@aws-sdk\//.test(text)]).toEqual([file, false]);
    }
  });
});

describe('mobile bundle configuration', () => {
  test('only the public Supabase URL and publishable key can be inlined into the app', () => {
    const config = require('../babel.config.js');
    const plugin = config.plugins.find(p => Array.isArray(p) && p[0] === 'transform-inline-environment-variables');
    expect(plugin[1].include).toEqual(['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']);
  });
});
