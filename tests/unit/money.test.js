import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBRL } from '../../src/core/money.js';

test('parseBRL converte padrão brasileiro', () => {
  assert.equal(parseBRL('R$ 1.234,56'), 1234.56);
  assert.equal(parseBRL('0,00'), 0);
});
