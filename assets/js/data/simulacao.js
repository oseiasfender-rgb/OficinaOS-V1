export const SIM={
 cliente:{nome:'João da Silva',telefone:'(19) 99999-0001',doc:'123.456.789-00',veiculo:'Ford Ka 2018',placa:'ABC1D23',whatsapp:'(19) 99999-0001'},
 orcamento:{servico:'Reparo lateral + pintura parcial',prioridade:'Normal',complexidade:'Médio',margem:0,desconto:0,horas:{desmontagem:1.5,funilaria:3,solda:0,preparacao:2,pintura:2.5,montagem:1,polimento:.5},valorHora:50,
 materiais:[{nome:'Primer PU',categoria:'Pintura',qtd:1,un:'l',custo:120,aplicado:120,fornecedor:'Loja Tintas'},{nome:'Verniz HS',categoria:'Pintura',qtd:1,un:'l',custo:180,aplicado:180,fornecedor:'Loja Tintas'},{nome:'Lixas',categoria:'Preparação',qtd:10,un:'un',custo:5,aplicado:50,fornecedor:'Auto Peças'}],
 pecas:[{nome:'Porta usada',condicao:'Boa',disponivel:true,custo:250,valor:350,fornecedor:'Desmanche X',local:'Prateleira A1',foto:''},{nome:'Retrovisor recuperado',condicao:'Recuperada',disponivel:true,custo:80,valor:120,fornecedor:'Estoque interno',local:'Caixa 02',foto:''}],
 terceiros:[{nome:'Martelinho',valor:180},{nome:'Higienização',valor:90}],frete:[{nome:'Guincho',valor:150},{nome:'Entrega',valor:40}]},
 contas:[{descricao:'Aluguel',categoria:'Fixo',valor:1200,vencimento:'2026-06-10',status:'pendente'},{descricao:'Materiais de pintura',categoria:'Oficina',valor:419,vencimento:'2026-06-14',status:'paga',dataPagamento:'2026-06-14'},{descricao:'DAS MEI',categoria:'Impostos',valor:87.05,vencimento:'2026-06-20',status:'pendente'}]
};
