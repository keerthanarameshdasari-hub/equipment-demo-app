import { expect, test } from '@jest/globals';

// TEMPORARY: deliberately failing test to prove that a failing check fails
// the CI workflow (Prompt 3 acceptance). Reverted in the next commit.
test('CI failure demo (intentional)', () => {
  expect(1 + 1).toBe(3);
});
