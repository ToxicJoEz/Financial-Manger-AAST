import test from 'node:test';
import assert from 'node:assert/strict';
import { sameStudent } from '../src/utils/studentIdentity.js';

test('A student is the same person only when the name and the phone both match', () => {
  const student = { name: 'أحمد محمد', englishName: 'Ahmed Mohamed', mobile: '01012345678' };
  assert(sameStudent(student, { name: 'أحمد محمد', mobile: '+20 1012345678' }), 'same name, phone written differently');
  assert(sameStudent(student, { name: 'احمد  محمد', mobile: '01012345678' }), 'alef variant and extra spaces');
  assert(sameStudent(student, { name: 'ahmed mohamed', mobile: '01012345678' }), 'English name, any case');
  assert(!sameStudent(student, { name: 'سارة محمد', mobile: '01012345678' }), 'a sibling sharing the phone');
  assert(!sameStudent(student, { name: 'أحمد محمد', mobile: '01099999999' }), 'same name, other phone');
  assert(!sameStudent(student, { name: 'أحمد محمد', mobile: '' }), 'no phone');
});
