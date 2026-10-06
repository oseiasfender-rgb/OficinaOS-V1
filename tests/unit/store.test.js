import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../../src/core/app-store.js';

test('store devolve cópia e não expõe mutação direta', () => {
  const s=createStore({clients:[{id:'c1'}]});
  const copy=s.getState(); copy.clients.push({id:'c2'});
  assert.equal(s.getState().clients.length,1);
});
