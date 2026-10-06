import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCanonical, duplicateIds } from '../../src/data/integrity.js';

test('auditoria detecta IDs duplicados', () => {
  assert.deepEqual(duplicateIds([{id:'a'},{id:'a'},{id:'b'}]), ['a']);
  const report = auditCanonical({ transactions: [{id:'x'},{id:'x'}] });
  assert.equal(report.valid, false);
  assert.equal(report.duplicateCount, 1);
});

test('assinatura Financeiro/Contas detecta alteração de valor ou vínculo mesmo com mesmas contagens', async () => {
  const { financialSignatures, compareFinancialSignatures } = await import('../../src/data/integrity.js');
  const before=financialSignatures({transactions:[{id:'t1',val:100,type:'dep',contaId:'c1'}],accounts:[{id:'c1',val:100,paidTxId:'t1'}]});
  const same=financialSignatures({transactions:[{id:'t1',val:100,type:'dep',contaId:'c1'}],accounts:[{id:'c1',val:100,paidTxId:'t1'}]});
  assert.equal(compareFinancialSignatures(before,same).equal,true);
  const changed=financialSignatures({transactions:[{id:'t1',val:90,type:'dep',contaId:'c1'}],accounts:[{id:'c1',val:100,paidTxId:'t1'}]});
  const result=compareFinancialSignatures(before,changed);assert.equal(result.equal,false);assert.ok(result.differences.includes('transactions'));
});
