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
