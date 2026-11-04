# Correção 8 — proteções da revisão de todas as abas

04/11/2026. Build: estoque-20261104-r1-fix8.
URL: https://oseiasfender-rgb.github.io/OficinaOS-V1/homologacao/estoque-r1/
TESTES SOMENTE. Mesmo banco local oficinaos_homologacao_estoque_20261028 e ambiente homologacao_estoque_v1. Não modifica saldos existentes automaticamente. Produção permanece separada.

## Correções implementadas

| ID | Correção | Evidência |
|---|---|---|
| EST-01 | Formulário de Material captura o registro persistido ao abrir. O serviço recebe expected e a transação compara novamente antes de gravar. Aplicado no Estoque e no seletor do Orçamento. O editor aguarda a leitura do registro com campos bloqueados, evitando que o carregamento sobrescreva a digitação. Ajustes +/- também conferem a leitura usada para calcular a diferença. | 10→8 por orçamento; tentar salvar formulário antigo com 10 é rejeitado; 8 e foto preservados. Edição fresca continua disponível. |
| CLI-01 | Exclusão de cliente lê os vínculos e grava backup/exclusão na mesma transação. Bloqueia vínculos por clientId/clienteId, incluindo ID numérico referido como texto, em orçamentos/histórico/arquivados/lixeira/OS/Agenda/jobs/financeiro/contas. Não infere vínculo apenas por semelhança do nome. | Testes por repositório; cliente vinculado fica preservado sem falso backup de exclusão; cliente livre é excluído com cópia integral. Falha no backup reverte exclusão. |
| MET-01 | Renomeação de meta confere registro original e colisões na transação, gravando novo nome e removendo antigo juntos. | Falha sintética após inclusão do novo registro reverte tudo; original preservado e novo ausente. Edição obsoleta e colisão bloqueadas. |
| CFG-01 | Rascunho preservado ao trocar de aba; botão Descartar alterações pede confirmação; salvamento e preparo de logo bloqueiam envio duplicado; beforeunload avisa ao sair/recarregar. canApplyRemote bloqueia substituição pela nuvem enquanto houver rascunho ou trabalho em andamento. Descarte notifica o fluxo para liberar conferência novamente. | Interface 1366×768 e 412×915: navegar/voltar mantém nome sem gravar; cancelar descarte mantém; confirmar restaura; salvar persiste; guarda remota rejeita rascunho. Rascunho é de sessão, não backup permanente. |
| MAN-01 | Manual esclarece selecionar versus salvar, repetição sem nova baixa, devolução de linha, itens avulsos e exclusão. Novos artigos de sincronização/offline e proteção de cadastros/rascunhos. | Teste do conteúdo e consulta pelo Manual na interface. Nenhuma IA/provedor externo introduzido. |

## Validação

- 347 testes unitários aprovados (330 anteriores + 17 novos).
- Compilação Vite aprovada.
- check-review-protections-ui.mjs: novas proteções na interface em PC/Android simulado.
- Regressões: check-budget-stock-ui.mjs, check-document-hub.mjs, check-stock-consumption.mjs, check-budget-backup-offline.mjs.
- Dados fictícios em perfis descartáveis e fake-indexeddb; não usa dados de usuário.
- CI executa a nova verificação antes da publicação. Fotos/backups do usuário não integram o pacote.

## Limites e próximos passos

Esta correção não implementa CSV, novos filtros financeiros, histórico mensal automático, bancos configuráveis ou alinhamento de atalhos/entrega: eram sugestões opcionais, não as cinco proteções priorizadas. Estoque e Orçamento continuam separados. A exclusão livre do cliente depende de ausência dos vínculos explícitos disponíveis; registros legados contendo somente nomes não são religados por inferência.

A conferência física PC/G75 e a auditoria técnica final ainda não foram concluídas. Conferir build/ambiente, orçamento, fotos, saldos e revisão nos dois aparelhos antes de liberar produção. Movimentações concorrentes nos dois aparelhos continuam sujeitas ao bloqueio para revisão; trabalhar em um aparelho por vez e sincronizar antes de trocar.

Fontes: src/data/repositories/index.js; src/modules/estoque/estoque-service.js e estoque-view.js; src/modules/orcamento/materials-stock-view.js; src/modules/clientes/client-links.js e clientes-service.js; src/modules/metas/metas-service.js; src/modules/configuracoes/configuracoes-view.js; src/modules/consultor/manual-local.js; tests/unit/review-protections.test.js; scripts/check-review-protections-ui.mjs.
