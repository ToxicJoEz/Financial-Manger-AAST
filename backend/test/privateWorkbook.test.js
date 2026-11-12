import test from 'node:test';
import assert from 'node:assert/strict';
import { privateDate, privateHours, phoneNumbers } from '../src/utils/privateWorkbook.js';
import { dateInputValue, dateText } from '../../frontend/src/utils/dates.js';
test('Private dates, duration and phone normalization preserve day-first and identity rules', () => {
  assert.equal(privateDate('11/9/20226').value, '2026-09-11');
  assert(privateDate('11/9/20226').note.includes('20226'));
  assert.equal(privateDate('02/11/2026').value, '2026-11-02');
  assert.equal(privateDate('31/02/2026').value, '');
  assert.equal(privateDate('11/09/21226').value, '');
  assert.equal(privateHours('18:30 Hrs / 999 EGP'), 18.5);
  assert.equal(privateHours('20 Hrs / 180 EGP'), 20);
  assert.equal(privateHours('18:90 Hrs'), '');
  assert.deepEqual(phoneNumbers('+20 100 000 0000 / 01011111111'), ['01000000000', '01011111111']);
  assert.deepEqual(phoneNumbers('١٠١١١١١١١١'), ['01011111111']);
  assert.equal(dateInputValue('02/11/26'), '2026-11-02');
  assert.equal(dateInputValue('31/02/26'), null);
  assert.equal(dateInputValue('11/09/2026'), '2026-09-11');
  assert.equal(dateText('2026-09-11'), '11/09/26');
  assert.equal(dateInputValue(''), '');
});

test('Private course names map to a private umbrella and level; durations suggest rates; shared fees split exactly', async () => {
  const { courseParts, durationRate, shareAmount } = await import('../src/utils/privateWorkbook.js');
  assert.deepEqual(courseParts('PET 2'), { umbrellaName: 'PET', cycleNumber: 2 });
  assert.deepEqual(courseParts('Pre-KET 4'), { umbrellaName: 'PRE-KET', cycleNumber: 4 });
  assert.deepEqual(courseParts('IELTS'), { umbrellaName: 'IELTS', cycleNumber: null });
  assert.deepEqual(courseParts('PET1/S'), { umbrellaName: 'PET', cycleNumber: 1, courseSuffix: 'S' });
  assert.equal(durationRate('20 Hrs / 180 EGP'), '180');
  assert.equal(durationRate('18:30 Hrs / 200EGP'), '200');
  assert.equal(durationRate('20 hours'), '');
  assert.deepEqual(shareAmount(7000, 2), [3500, 3500]);
  assert.deepEqual(shareAmount(10000, 3), [3333.34, 3333.33, 3333.33]);
});
