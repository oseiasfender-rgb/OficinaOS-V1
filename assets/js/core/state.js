export const STATE={
  config:{version:'V546.11',simulation:true,competencia:'2026-06'},
  clientes:{lista:[],next:1},
  orcamentos:{lista:[],ativo:null,next:1},
  financeiro:{transacoes:[],recebiveis:[],recibos:[],nfe:[],pix:[],next:1},
  contas:{lista:[],next:1},
  agenda:{eventos:[],next:1},
  metas:{principal:10000,categorias:[],historico:[]},
  relatorios:{cache:{}},
  ia:{analises:[]},
  ui:{tab:'orcamento',busca:''}
};
export const getState=()=>STATE;
