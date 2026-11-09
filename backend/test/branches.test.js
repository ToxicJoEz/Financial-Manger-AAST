import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPLOYEE_BRANCHES } from '../src/utils/employees.js';
import { PRIVATE_SEAT_LIMIT } from '../src/utils/privateSeat.js';

// The frontend is built separately, so its constants are compared as source text.
const constants = readFileSync(new URL('../../frontend/src/Constants.js', import.meta.url), 'utf8');

test('frontend and backend share the same branch list', () => {
  const list = constants.match(/export const BRANCHES = \[([^\]]*)\]/);
  assert(list, 'BRANCHES not found in frontend/src/Constants.js');
  assert.deepEqual(
    list[1]
      .split(',')
      .map(item => item.trim().replace(/^'|'$/g, ''))
      .filter(Boolean),
    EMPLOYEE_BRANCHES
  );
});

test('frontend and backend share the private cycle seat limit', () => {
  assert.equal(Number(constants.match(/export const PRIVATE_SEAT_LIMIT = (\d+)/)?.[1]), PRIVATE_SEAT_LIMIT);
});
