# Aba Orçamento — situação de encerramento em 28/10/2026

Candidata: estoque-20261028-r1-fix4. URL: https://oseiasfender-rgb.github.io/OficinaOS-V1/homologacao/estoque-r1/ . TESTES SOMENTE, ambiente homologacao_estoque_v1. Mesmos dados da candidata anterior; não migra ou altera automaticamente saldos. Produção e r5 permanecem preservadas.

## Corrigido e verificado por código e testes

- Salvar, repetir salvamento, editar quantidades, duplicar e reabrir sem repetir baixa.
- Materiais do Estoque e peças do catálogo baixados junto com o orçamento, na mesma transação. Insuficiência reverte a operação completa.
- Remover linha devolve apenas quantidade efetivamente debitada. Arquivar/lixeira não devolvem automaticamente.
- Escolher do catálogo abre janela modal de Peças, com busca, filtro, fotos e unidades. Cadastro/edição em janela própria; Escape e proteção de alterações não salvas.
- Catálogo distingue tipos cadastrados de unidades disponíveis. Campo de quantidade pede preenchimento explícito, sem presumir uma unidade no novo cadastro.
- Linhas indicam vínculo ao Estoque/catálogo, quantidade disponível e quantidade já baixada neste orçamento. Linhas avulsas avisam que não movimentam estoque.
- Confirmação de salvamento informa se houve ajuste ou nenhuma nova baixa.
- Material com baixa vinculada não pode ser excluído nem trocar unidade. A proteção é conferida na transação junto com os saldos; edição antiga não restaura saldo anterior.
- Editor antigo de peça não sobrescreve saldo já movimentado; ajuste manual exige confirmação e registro. Edição parcial de descrição preserva quantidade e foto. Cadastro com baixa ativa não pode ser excluído.
- Revisão sem OS transfere alocação, sem novo débito. Revisão com execução vinculada exige tratamento na origem.
- OS aproveita baixa do orçamento, desconta somente excedente e registra devoluções sem reabrir crédito já utilizado.
- Documento comercial: prévia, PDF, PNG, impressão, texto, opções de fotos, reabertura e layout verificados por testes de interface; compartilhamento nativo foi simulado, sem envio a pessoas.
- Layout testado em 1366x768 e 412x915, sem rolagem horizontal da página, com IndexedDB real no Chromium e serviços reais. Não equivale ao uso nos aparelhos físicos.

## Evidência física já fornecida pelo usuário

- Na r5, opção de manter todos ativos e corrigir numeração: orc_008 e orc_009 distintos; fotos nos dois aparelhos, conforme confirmação do usuário. Esse aceite não foi convertido em aprovação geral desta candidata de estoque.
- Material baixou no teste do usuário.
- Usuário informou 10 Paralama iniciais, 5 usados e 5 disponíveis. Backup analisado tinha 5 baixados registrados e cadastro com 10. A correção não alterou retroativamente o saldo do aparelho; a conciliação deve preservar a baixa já registrada.
- Android mostrou sessão autenticada na candidata, porém pausada. Não foi enviada evidência de mesma revisão e saldos recebidos nesta candidata.

## Pendente para fechar a homologação desta versão

1. Confirmar no PC o cadastro com 5 Paralama disponíveis e orçamento anterior com 5 usados. Salvar novamente deve manter 5 disponíveis.
2. Sincronizar o PC e receber/conferir no Android o mesmo orçamento, foto, quantidade disponível e mesma revisão, no ambiente homologacao_estoque_v1.
3. Criar um novo orçamento de teste no Android usando uma unidade da peça do catálogo; ao salvar, saldo 4. Sincronizar e conferir saldo 4 no PC, mesma revisão e nenhuma perda de foto.

Sem estes resultados físicos, o status é CANDIDATA TESTADA AUTOMATICAMENTE, NÃO HOMOLOGADA PARA PRODUÇÃO.

## Limites de operação

Peças usam catálogo separado de Materiais, ainda sem migração de catálogo para a coleção stock. Itens avulsos não recebem vínculo por semelhança de nome. Baixas concorrentes nos dois aparelhos são bloqueadas para revisão; não existe resolução automática segura de conflitos de saldo nesta entrega. Use um aparelho por vez, sincronizando antes de passar ao outro. Estes limites são explícitos, não pendências ocultadas por mensagens de sucesso.

## Resultado automático desta revisão

329 testes unitários passaram, compilação Vite passou, interface de estoque desktop/mobile passou, documento comercial passou, consumo da OS passou. Estes resultados são reproduzidos pelo workflow do GitHub antes da publicação.

## Fontes de verificação

Testes: tests/unit/*.test.js; scripts/check-budget-stock-ui.mjs; scripts/check-document-hub.mjs; scripts/check-stock-consumption.mjs. Implementação: src/modules/orcamento; src/data/repositories/index.js. Evidência física: capturas, backup e declarações do usuário nesta conversa. Nenhum backup ou foto do usuário acompanha este documento ou o pacote de código.
