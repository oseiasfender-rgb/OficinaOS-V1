export function gerarTextoOrcamento(orc,resumo){return `ORÇAMENTO ${orc.id}
Cliente: ${orc.clienteNome}
Serviço: ${orc.servico}
Total: ${resumo.total.toFixed(2)}`}
