# Baixa ao salvar orçamento — candidata, não publicada

Arquivos deste diretório substituem os caminhos correspondentes na fonte r5-quota1. Não aplicar sobre o aplicativo de produção.

Implementado: transação IndexedDB de orçamento, materiais e catálogo de peças; ajustes por diferença; bloqueio de saldo insuficiente; trilha em settings; preservação de fotos; duplicação baixa como nova inclusão; linhas sem vínculo não movimentam saldo. Orçamentos antigos não geram baixa nem crédito retroativo. Reduzir/remover linha devolve somente quantidades debitadas por esta função. Arquivar/enviar orçamento à lixeira não devolve automaticamente.

Validação local: 319 testes passaram, build Vite passou. Teste de atomicidade com fake-indexeddb confirma que falta de peças reverte também a baixa de material e a gravação do orçamento.

PENDENTE antes de deploy: integração entre baixa do orçamento e consumo/devolução na execução da OS (evitar duas baixas do mesmo consumo); consistência em conflitos de sincronização com dois aparelhos alterando simultaneamente saldo e orçamento; revisão/aprovação/restauração; testes físicos PC/G75. Os cadastros de peças ainda usam fp_pecas_rec; não foram unificados à coleção stock.

Esta branch é preparação de código. A r5 hospedada, main, produção e dados dos aparelhos permanecem inalterados. Não homologada.
