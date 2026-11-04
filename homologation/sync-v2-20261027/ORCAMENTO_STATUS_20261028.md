# Aba Orçamento — situação de encerramento

Atualizado em 04/11/2026. Candidata: **estoque-20261104-r1-fix8**.
URL: https://oseiasfender-rgb.github.io/OficinaOS-V1/homologacao/estoque-r1/
Ambiente isolado: homologacao_estoque_v1. TESTES SOMENTE.

**Estado: candidata tecnicamente testada; homologação física e auditoria final pendentes.**
A versão instalada de produção não foi substituída. Nenhum saldo real foi corrigido automaticamente.

## Evidências técnicas concluídas

- 347 testes unitários aprovados na revisão fix8; compilação Vite aprovada.
- Interface em Chromium 1366×768 e 412×915, com IndexedDB e serviços reais, dados fictícios: salvar/repetir/editar/duplicar/reabrir, insuficiência com reversão integral, devolução de linha, avulso sem baixa, proteção contra editor obsoleto de peça.
- Materiais e Peças em janelas distintas no Estoque. Mesmo catálogo de peças acessado pelo Orçamento, sem segundo saldo. Tipos cadastrados e unidades disponíveis separados.
- Foto de material: inserir, editar outros campos, ajustar saldo, remover; serviço preserva foto na baixa, devolução e cópia de exclusão. Peças e fotos por etapa preservadas nos testes.
- Exclusão de item livre com cópia preventiva; exclusão de item com baixa vinculada bloqueada. Excluir cópia de peça exige confirmação e remove seu payload/foto da cópia atual, mantendo marcador de descarte. Versões históricas e backups exportados não são apagados.
- Revisão anterior à OS transfere alocação sem repetir baixa. Orçamento já vinculado à execução exige consumo/devolução na OS; crédito já usado não pode ser reaproveitado depois da devolução.
- Documento comercial: prévia/PDF/PNG/impressão/texto e reabertura testados; compartilhamento nativo simulado, sem envio a pessoas.
- **Novo teste de backup/offline (03/11):** build de produção servido localmente no mesmo subcaminho da candidata; exportação pelo botão da aplicação, importação em outro perfil vazio e importação repetida. Igualdade dos orçamentos, fotos, IDs, estoque, catálogo, alocação, registros de baixa e marcador de descarte.
- **Offline:** reabrir, salvar sem nova baixa, aumentar material de 2 para 3 unidades (saldo 8→7), fechar a página e abrir nova página offline; saldo e fotos preservados. Peça permanece com saldo 4.
- Service worker com escopo da candidata; remoção do cache antigo dessa rota preserva cache sentinela de outra rota. Não equivale a instalação/atualização física do PWA.

Scripts: scripts/check-budget-stock-ui.mjs; scripts/check-document-hub.mjs; scripts/check-stock-consumption.mjs; scripts/check-budget-backup-offline.mjs.
Evidência nova: homologation/sync-v2-20261027/evidence-backup-offline-20261103.json no GitHub. Apenas metadados dos testes; nenhuma foto ou backup do usuário.

## Evidência física anterior — não estender à candidata atual

- Na r5, usuário confirmou numeração distinta orc_008/orc_009 e fotos no PC/Android.
- Material baixou no teste do usuário. Foi informado: 10 Paralama iniciais, 5 usados e 5 fisicamente disponíveis. Backup anterior registrava baixa de 5 e cadastro com 10 disponíveis; a divergência não foi corrigida por inferência automática.
- Android apresentou sessão autenticada e sincronização pausada na candidata de estoque. Ainda não há evidência de mesma revisão/saldo/fotos nesta revisão nos aparelhos físicos.

## Portas de conclusão ainda abertas

| Item | Critério de aceite | Estado |
|---|---|---|
| Saldo físico anterior | 5 Paralama usados + 5 disponíveis; salvar novamente mantém 5 disponíveis | Não comprovado na fix8 |
| PC → Android → PC | Mesma conta/ambiente; mesmo orçamento, foto, saldo e revisão; novo orçamento Android usa 1 peça: 5→4, recebido no PC sem segunda baixa | Pendente físico |
| Últimas telas | Nos dois aparelhos: foto de material inserir/substituir/remover; edição, exclusão de item livre e cópia preventiva | Teste automatizado aprovado; físico pendente |
| Documentos | PDF/PNG com valores e fotos; impressão PC e compartilhar Android | Físico pendente; compartilhar apenas simulado |
| Backup/offline | Exportar/importar/repetir com fotos e saldos; reabrir e salvar offline | Concluído tecnicamente em navegador; físico pendente |
| Auditoria técnica final | Matriz código/teste/evidência e parecer aprovado/não aprovado após o aceite funcional | Ainda não executada |
| Publicação para produção | Revisão final congelada, backup, atualização controlada e conferência após atualização | Não liberada |

## Roteiro mínimo nos aparelhos

1. Confirmar fix8 e homologacao_estoque_v1 no PC e Android; exportar backup antes do teste.
2. No PC, conferir o saldo real informado de Paralama e o orçamento já baixado. Não forçar uma segunda baixa para corrigir o cadastro.
3. Salvar de novo o orçamento sem alterar quantidade: saldo deve permanecer 5.
4. Sincronizar PC; receber no Android; conferir orçamento/fotos/saldo/revisão iguais.
5. No Android, criar novo orçamento de teste usando 1 peça do catálogo, salvar: saldo 4. Sincronizar e receber no PC: saldo 4, mesma revisão.
6. Conferir foto de material, documento/compartilhamento e reabertura offline. Registrar resultado de cada passo, incluindo qualquer falha.

## Limites declarados

Movimentações concorrentes de saldo em dois aparelhos são bloqueadas para revisão, sem resolução automática nesta entrega. Usar um aparelho por vez e sincronizar antes de trocar. Itens avulsos não ganham vínculo por semelhança de nome. Arquivar/lixeira não devolvem estoque automaticamente. Backup compatível de outro ambiente não deve substituir dados atuais sem conferência prévia.

## Auditoria final programada no fluxo de trabalho

Após o aceite funcional: cálculos/margem/desconto/cenários; persistência e numeração; transações, falhas e concorrência; fotos, documentos, backup; vínculos OS/Agenda/receita; isolamento, offline/atualização e regressões. Registrar para cada item: identificado no código, testado, falhou ou não verificado. O número de testes não substitui esse parecer.

## Proteções adicionais — 04/11/2026
As cinco pendências da revisão transversal foram implementadas e testadas: EST-01, CLI-01, MET-01, CFG-01 e MAN-01. Ver CORRECOES_ABAS_20261104.md e testes review-protections.test.js / check-review-protections-ui.mjs. A reprodução de EST-01 mostrou que a conclusão antiga sobre proteção do editor de Material era ampla demais; fix8 passa a conferir a versão de abertura até a transação de gravação. Nenhuma atualização automática dos saldos anteriores foi feita. Melhorias opcionais da revisão não fazem parte desta correção.
