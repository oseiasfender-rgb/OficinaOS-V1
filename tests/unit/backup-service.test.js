import test from 'node:test';
import assert from 'node:assert/strict';
import { STATE_STORES } from '../../src/data/schema.js';
import { exportLegacyCompatibleBackup } from '../../src/data/backup-service.js';

function repo(rows = []) {
  return { async list(){ return structuredClone(rows); } };
}

test('backup compatível mantém configurações dinâmicas como fotos de clientes', async () => {
  const repositories = Object.fromEntries(STATE_STORES.map(name => [name, repo()]));
  repositories.clients = repo([{ id: 100, nome: 'Cliente Teste', name: 'Cliente Teste', veiculos: [], servicos: [] }]);
  repositories.settings = repo([
    { id: 'fp_fotos_100', value: { antes: [{ src: 'data:image/png;base64,AAAA', nome: 'a.png' }], depois: [] } },
    { id: 'fp_meta_principal', value: 9000 }
  ]);
  repositories.meta = repo([{ id: 'schema', value: 'oficinaos-modular-v4' }]);
  const backup = await exportLegacyCompatibleBackup(repositories);
  assert.equal(backup.version, '2.6-modular-compatible');
  assert.equal(backup.clientes.length, 1);
  assert.equal(backup.fp_meta_principal.antes, undefined);
  assert.equal(backup.metaPrincipal, 9000);
  assert.equal(backup.fp_fotos_100.antes[0].nome, 'a.png');
});

test('backup legado exporta só categorias personalizadas como fp_fin_categories e preserva ocultas', async () => {
  const repositories = Object.fromEntries(STATE_STORES.map(name => [name, repo()]));
  repositories.categories = repo([
    { id: 'Serviços', name: 'Serviços', group: 'operacao', hidden: true, custom: false, source: 'builtin-override' },
    { id: 'Especial', name: 'Especial', group: 'outros', hidden: false, custom: true, source: 'modular-custom' },
    { id: 'Antiga', name: 'Antiga', group: 'outros', hidden: true, custom: false, source: 'referenced-override' }
  ]);
  repositories.settings = repo([]);
  repositories.meta = repo([]);
  const backup = await exportLegacyCompatibleBackup(repositories);
  assert.deepEqual(backup.fp_fin_categories, ['Especial']);
  assert.equal(backup.fp_fin_category_groups.Serviços, 'operacao');
  assert.deepEqual(new Set(backup.fp_fin_categories_hidden), new Set(['Serviços','Antiga']));
});
