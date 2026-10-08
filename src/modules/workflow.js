export const WORKFLOW_STAGES = Object.freeze([
  { id: 'entrada', label: 'Entrada' },
  { id: 'desmontagem', label: 'Desmontagem' },
  { id: 'funilaria', label: 'Funilaria' },
  { id: 'solda', label: 'Solda' },
  { id: 'preparacao', label: 'Preparação' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'cura', label: 'Cura' },
  { id: 'polimento', label: 'Polimento' },
  { id: 'montagem', label: 'Montagem' },
  { id: 'controle', label: 'Controle Final' },
  { id: 'entregue', label: 'Entregue' }
]);

export const STAGE_IDS = Object.freeze(WORKFLOW_STAGES.map(stage => stage.id));

export async function findRecordById(repository, id) {
  if (id == null || String(id).trim() === '') return null;
  const exact = await repository.get(id);
  return exact ?? (await repository.list()).find(row => String(row.id) === String(id)) ?? null;
}

export function validateWorkflowDates(entry, due) {
  for (const value of [entry, due]) {
    if (!value) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Informe uma data válida no formato AAAA-MM-DD.');
    const date = new Date(`${value}T00:00:00Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Informe uma data válida.');
  }
  if (entry && due && due < entry) throw new Error('A entrega prevista não pode ser anterior à entrada.');
}

export function normalizeStage(value, delivered = false) {
  if (delivered) return 'entregue';
  const s = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (s.includes('entreg') || s.includes('finaliz')) return 'entregue';
  if (s.includes('desmont')) return 'desmontagem';
  if (s.includes('funil') || s.includes('chap')) return 'funilaria';
  if (s.includes('sold')) return 'solda';
  if (s.includes('prep')) return 'preparacao';
  if (s.includes('pint')) return 'pintura';
  if (s.includes('cura')) return 'cura';
  if (s.includes('pol')) return 'polimento';
  if (s.includes('mont')) return 'montagem';
  if (s.includes('controle')) return 'controle';
  return 'entrada';
}

export function stageLabel(id) {
  return WORKFLOW_STAGES.find(stage => stage.id === id)?.label ?? 'Entrada';
}
