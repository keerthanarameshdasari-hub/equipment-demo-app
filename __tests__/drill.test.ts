import { expect, test } from '@jest/globals';
import { describeCount } from '../src/domain/equipment';

// DRILL (Prompt 9): deliberately failing test on a disposable branch.
// Expected: CI fails and no release candidate can be built. Removed by the fix commit.
test('DRILL: deliberately failing test', () => {
  expect(describeCount(5, 5)).toBe('6 items');
});
