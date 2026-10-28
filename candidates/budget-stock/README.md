# Baixa de estoque — candidata não publicada

Arquivos substituem os caminhos correspondentes na fonte r5-quota1. Materiais baixam da coleção stock; peças do catálogo fp_pecas_rec. Salvar aplica diferença e não repete débito; remover linha devolve só o debitado. Itens manuais sem vínculo não baixam estoque. Legado não recebe baixa ou crédito retroativo. Fotos preservadas. Gravação atômica de saldos, orçamento e trilha, com bloqueio por saldo insuficiente.

Integração OS: consumo aproveita baixa prévia do orçamento e debita somente excedente. Devolução repõe saldo, sem reabrir crédito já utilizado. Orçamento vinculado à OS não admite ajuste de baixa: consumo/devolução deve ocorrer na execução. Revisão sem OS transfere alocação sem novo débito; revisão com execução vinculada é bloqueada para análise operacional. Duplicar orçamento representa nova inclusão e baixa. Arquivar/lixeira não devolvem automaticamente.

Sincronização bloqueia combinação de operações concorrentes de saldo, catálogo, créditos e execução. Não soma automaticamente saldos nem escolhe por relógio.

323 testes locais passaram e build Vite passou: atomicidade, repetição, insuficiência, crédito pré-baixado, excedente, devolução, transferência de revisão e conflitos concorrentes. Ainda não validada fisicamente no PC/G75. Resolução assistida dos conflitos de saldo e teste da interface permanecem pendentes. Nenhum deploy foi executado; r5 e produção permanecem inalteradas.
