# OficinaOS — revisão de todas as abas em 04/11/2026

## Parecer desta revisão

**Não consolidar como concluído nem liberar produção ainda.** Foram confirmadas falhas de proteção e uma instrução incompleta. A maior parte das correções propostas não exige novas abas, bancos ou cadastros. Esta é uma revisão transversal anterior à conferência física, não a auditoria técnica final acordada.

Base: candidata estoque-20261028-r1-fix7; branch de publicação em c6ba4828cf9099ec15886eac2cabe90d2a9ac91c. A revisão não alterou funcionalidades nem dados reais. Produção permanece separada.

## O que foi executado

- Leitura de navegação, serviços e telas das 12 abas, incluindo Contas e Metas.
- Suíte existente: 330 testes aprovados. Referência remota anterior: https://github.com/oseiasfender-rgb/OficinaOS-V1/actions/runs/41740010209 .
- Abertura de 14 destinos em Chromium 1366×768 e 412×915, build local em perfis descartáveis: nenhum erro de JavaScript observado e nenhum transbordamento horizontal da página nessas telas vazias.
- Reprodução adicional em fake-indexeddb, com dados fictícios: editor antigo de Material, exclusão de cliente vinculado, falha de gravação ao renomear meta e histórico de metas.
- Interface: sair de Configurações com nome não salvo e voltar elimina o rascunho sem confirmação, após concluir o carregamento.

Limite: abertura de telas não equivale a aprovação de CRUD, documentos ou todos os caminhos de cada aba. Nenhuma validação física PC/Android, autenticação ou sincronização em conta real foi feita nesta revisão. Os novos casos reproduzidos ainda não estão cobertos pela suíte de 330 testes.

## Falhas confirmadas e correção mínima

| ID | Prioridade | Evidência | Correção proposta |
|---|---|---|---|
| EST-01 | Alta | Formulário de Material captura saldo 10; orçamento baixa 2, saldo 8; salvar campos antigos pela API usada no formulário restaura 10, enquanto a alocação mantém 2 baixados. A proteção atual compara com a leitura feita no envio, não com o cadastro capturado na abertura do editor. | Exigir versão/snapshot original na edição do material, nas duas entradas (Estoque e seletor do Orçamento); rejeitar formulário antigo sem alterar saldo/foto; teste de regressão. |
| CLI-01 | Alta | Cliente referenciado por orçamento pode ser excluído. Novo salvamento desse orçamento retorna “Cliente cadastrado não encontrado.” A cópia preventiva existe, mas não evita o vínculo inválido. | Bloquear exclusão se houver orçamento/OS/Agenda/lançamento vinculado; permitir exclusão de cliente sem uso. Arquivamento pode ficar para outra etapa. |
| MET-01 | Média | Ao renomear categoria da meta, o serviço exclui o registro antigo antes de gravar o novo. Falha simulada no put deixa ambos ausentes. | Gravar exclusão/inclusão na mesma transação, preservando a original se houver falha. |
| MAN-01 | Média | Manual local descreve corretamente que selecionar material não baixa estoque, mas omite que salvar o orçamento vinculado baixa. Também não cobre os novos fluxos de peças/fotos/offline. | Corrigir instrução: selecionar não baixa; salvar orçamento vinculado baixa; editar quantidade ajusta diferença; avulso não baixa. Acrescentar instruções curtas das funções novas. |
| CFG-01 | Média | Nome da oficina alterado sem salvar se perde ao trocar de aba e voltar; refresh recarrega o valor salvo sem aviso. | Aviso de alteração não salva ou preservação explícita do rascunho. Não salvar automaticamente sem solicitação. |

A reprodução EST-01 retifica a conclusão anterior excessivamente ampla sobre proteção de edição obsoleta de Materiais. A proteção existente é insuficiente para esse caminho; a edição de Peças usa outro mecanismo e permanece separada desse achado.

Fontes: src/modules/estoque/estoque-service.js e estoque-view.js; src/modules/orcamento/materials-stock-view.js; src/modules/clientes/clientes-service.js; src/modules/orcamento/orcamento-service.js (resolveClient); src/modules/metas/metas-service.js (renameCategoryGoal); src/modules/consultor/manual-local.js; src/modules/configuracoes/configuracoes-view.js e src/app/app-shell.js.

## Matriz de todas as abas

| Aba/seção | Identificado no código e testes existentes | Falta/cuidado | Sugestão de baixa complexidade |
|---|---|---|---|
| Migração | Importar/exportar JSON, auditor de contagens e cópia preventiva; backup/offline testados anteriormente | Tela mostra fases e linguagem técnica; nome pouco intuitivo para uso diário | Exibir “Backup e recuperação”; manter fases técnicas recolhidas. Aviso de substituição já existe: preservar. Não precisa novo mecanismo de backup. |
| Orçamento | Cálculos, cenários, aprovação/revisão, documentos, estoque, execução e histórico | EST-01 afeta cadastro de material acessível aqui; CLI-01 pode bloquear edição de orçamento existente. Validação física pendente | Corrigir proteções, manter seletores em janelas. Não acrescentar outra grande seção nem unificar a gestão do Estoque. |
| Financeiro | Receitas/despesas, pagamento/desfazer, vínculos com Contas, transferências, recibos, PIX e fluxo projetado | Opções bancárias atuais são fixas; CSV financeiro não foi localizado na tela atual. Aprovação global não demonstrada por este teste | Filtro Pago/Pendente; CSV do período filtrado se necessário. Identificar saldos como informados/conferidos. Bancos configuráveis só se houver necessidade real. |
| Contas | Parcelas/recorrências, pagamento/desfazer, competência do DAS e valores reais da guia | Não emite guia oficial. Verificar pagamento e estorno reais no aceite físico | Manter os recursos atuais e textos claros sobre guia/pagamento; não adicionar cálculo tributário automático. |
| Clientes | Cadastro/edição, veículos, serviços, histórico e fotos | CLI-01. Fotos antes/depois e documentos do cliente ainda precisam aceite físico | Bloquear exclusão vinculada e mostrar motivo; alerta de possível duplicidade por telefone/placa pode ficar para depois. |
| Categorias | Cadastro, grupos, ocultar/restaurar e contagem de uso | Categoria financeira não é o mesmo cadastro de tipo de material/peça | Manter “Ocultar” para usadas e preservar histórico; não unificar categorias de naturezas distintas à força. |
| Estoque | Materiais/Peças em janelas separadas, fotos e saldos compartilhados com Orçamento, exclusão protegida | EST-01; ajustes manuais de Material não têm o mesmo registro específico de ajuste do catálogo de Peças | Primeiro corrigir versão do editor. Depois, se necessário, registrar motivo/antes/depois dos ajustes em um histórico recolhido, usando a estrutura existente. |
| Configurações | Identificação/logo/PIX e painel de nuvem; ambiente e revisão aparecem | CFG-01. Sincronização física da fix7 não demonstrada | Proteger rascunho; manter ambiente/última conferência visíveis. Não criar outro login. |
| Agenda | Calendário, edição de vínculos com confirmação, OS associada, entrega/reabertura e recibos | Aprovação física do ciclo Agenda→OS→Financeiro pendente | Atalhos “Hoje” já existem. Acrescentar filtro de status apenas se necessário; evitar duplicar os controles de execução da OS. |
| OS | 11 etapas, checklist, fotos por etapa, entrega/reabertura e recibos | Registro de execução/consumo está no Orçamento, em Aprovação/execução real. Entregar pelo Orçamento sincroniza receita pendente; pela OS orienta sincronização manual | Atalho para execução já existente e comportamento uniforme de entrega, sempre distinguindo receita pendente de pagamento recebido. Não criar segunda ficha de consumo. |
| Históricos | Histórico operacional, orçamento ativo/arquivado/lixeira, cópias e recuperação de orçamento | Nem toda cópia de cliente/material/meta tem recuperação guiada nessa tela | Explicar alcance de cada opção e manter JSON como recuperação completa; não prometer recuperação individual onde não existe interface. |
| Resultados/Relatórios | Gráficos, ranking, série mensal/anual, limites, indicadores incluindo pendentes; aviso explícito já existe | Base difere de Metas (que conta recebidos). É escolha declarada, não erro demonstrado de cálculo | Filtro “Todos / Somente pagos” ou rótulo junto aos indicadores. Não chamar resultado registrado de lucro líquido apurado. |
| Metas | Meta principal/categoria, ritmo e projeção com receitas pagas | MET-01; histórico é lido de fp_metas_historico, mas não há geração de novos fechamentos mensais no serviço atual | Corrigir gravação atômica; botão simples “Guardar fechamento do mês”, idempotente por mês, ou rotular o histórico como importado. Sem automatismo adicional nesta etapa. |
| Manual | Busca e artigos locais; não depende de IA externa | MAN-01; instruções não acompanham todas as mudanças recentes | Atualizar artigos curtos para estoque/peças/fotos, baixa, backup, offline e sincronização; revisão por versão. Não adicionar chatbot externo. |

Fontes da matriz: src/app/app-shell.js; src/modules/*; tests/unit/*.test.js; scripts/check-budget-stock-ui.mjs; scripts/check-document-hub.mjs; scripts/check-stock-consumption.mjs; scripts/check-budget-backup-offline.mjs.

## Ordem recomendada, sem aumentar o escopo

1. Corrigir EST-01 e CLI-01, com testes de regressão.
2. Corrigir MET-01, CFG-01 e MAN-01.
3. Alinhar rótulos e atalho de execução/entrega; confirmar o comportamento comercial pretendido sem marcar pagamento automaticamente.
4. Conferência física PC/G75 com roteiro e fotos/saldos/revisão.
5. Auditoria técnica final e parecer de liberação.

Melhorias opcionais para depois: CSV filtrado, fechamento mensal de metas e motivo de ajuste de estoque. Não são motivo para criar novas abas ou reiniciar a arquitetura. Manter Estoque separado do Orçamento, Financeiro com Contas e Resultados com Metas, como já estão.

## Evidências anexas

- evidencias/servicos.json: reprodução das falhas em memória, sem dados do usuário.
- evidencias/navegacao.json: abertura das abas e rascunho de Configurações nos dois tamanhos.
- reproducoes/servicos.mjs e reproducoes/navegacao.mjs: scripts da revisão, a executar via stdin como módulo a partir da fonte da candidata. O de navegação usa o build dist e Chromium local; os caminhos /tmp são temporários e devem ser adaptados ao ambiente.
