import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
test('Vercel services own their builds and route API before frontend', () => {
  const config = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
  assert.equal(config.services.frontend.root, 'frontend');
  assert.equal(config.services.backend.root, 'backend');
  assert.equal(config.services.backend.framework, 'express');
  assert(existsSync(new URL('backend/' + config.services.backend.entrypoint, root)));
  for (const key of ['framework','functions','installCommand','buildCommand','outputDirectory']) assert(!Object.hasOwn(config, key));
  assert.equal(config.rewrites[0].destination.service, 'backend');
  assert.equal(config.rewrites[1].destination.service, 'backend');
  assert.equal(config.rewrites.at(-1).destination.service, 'frontend');
  assert.equal(config.services.frontend.rewrites[0].destination, '/index.html');
});
