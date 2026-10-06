export const BUILTIN_CATEGORIES = Object.freeze([
  'Funilaria e Pintura','Serviços','Serviço OS','Peças','Materiais de Pintura',
  'Materiais de Funilaria','Insumos','Terceiros','Frete e Deslocamento',
  'Aluguel / Barracão','Energia Elétrica','Água','Internet','Telefone','Impostos e Taxas',
  'Mão de Obra','Funcionários','Equipamentos','Ferramentas','Manutenção','Transporte',
  'Combustível','Assinaturas','Alimentação','Marketing','Contabilidade','Seguros',
  'Financiamento','Taxas Bancárias','Pró-labore','Outros'
]);

export const CATEGORY_GROUPS = Object.freeze({
  operacao: 'Operação da oficina',
  fixas: 'Fixas e estrutura',
  administrativo: 'Administrativo',
  pessoal: 'Pessoal',
  outros: 'Outros'
});

export const CATEGORY_GROUP_ORDER = Object.freeze(['operacao','fixas','administrativo','pessoal','outros']);

export const DEFAULT_CATEGORY_GROUPS = Object.freeze({
  operacao: Object.freeze(['Funilaria e Pintura','Serviços','Serviço OS','Peças','Materiais de Pintura','Materiais de Funilaria','Insumos','Terceiros','Frete e Deslocamento','Mão de Obra','Equipamentos','Ferramentas','Manutenção']),
  fixas: Object.freeze(['Aluguel / Barracão','Energia Elétrica','Água','Internet','Telefone','Financiamento','Seguros']),
  administrativo: Object.freeze(['Impostos e Taxas','Contabilidade','Assinaturas','Marketing','Taxas Bancárias']),
  pessoal: Object.freeze(['Funcionários','Pró-labore','Alimentação','Combustível','Transporte']),
  outros: Object.freeze(['Outros'])
});

export function categoryKey(value) {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR');
}

export function isBuiltinCategory(name) {
  const key = categoryKey(name);
  return BUILTIN_CATEGORIES.some(item => categoryKey(item) === key);
}

export function defaultGroupForCategory(name) {
  const key = categoryKey(name);
  for (const [group, names] of Object.entries(DEFAULT_CATEGORY_GROUPS)) {
    if (names.some(item => categoryKey(item) === key)) return group;
  }
  return 'outros';
}
