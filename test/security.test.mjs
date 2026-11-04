import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedRequest, cleanQuestion } from '../src/security.mjs';
test('localhost API rejects foreign origins, rebound hosts and missing tokens', () => {
  const base = { host: '127.0.0.1:4318', origin: 'http://127.0.0.1:4318', token: 'secret' };
  assert.equal(allowedRequest(base, 4318, 'secret'), true);
  assert.equal(allowedRequest({ ...base, origin: 'https://evil.example' }, 4318, 'secret'), false);
  assert.equal(allowedRequest({ ...base, host: 'evil.example:4318' }, 4318, 'secret'), false);
  assert.equal(allowedRequest({ ...base, token: undefined }, 4318, 'secret'), false);
});
test('blank or oversized questions cannot trigger paid calls', () => {
  assert.throws(() => cleanQuestion('   '), /question/i);
  assert.throws(() => cleanQuestion('x'.repeat(6001)), /long/i);
  assert.equal(cleanQuestion(' What is SPI? '), 'What is SPI?');
});
