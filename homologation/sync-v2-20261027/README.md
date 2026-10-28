# Candidata Sync V2 r4 — 27/10/2026

Não substitui a instalação original. Usa somente a homologação `homologacao_v2`.
Ao abrir, inicia pausada. Reutiliza o banco de homologação do navegador; não importe backups por cima dele.
Feche a versão antiga de homologação antes de abrir esta candidata no mesmo aparelho.

## Resolução
- Duplicidade: manter todos ativos renumera a partir do maior número encontrado, sem trocar IDs ou fotos.
- Escolher um registro por ID mantém esse ativo e arquiva integralmente os demais.
- Antes de aplicar, cria uma cópia preventiva local. A gravação aguarda formulários fechados e verifica que versões não mudaram.
- Aprovados e registros ligados a operações continuam bloqueados para revisão no módulo de origem.
- Aplicar não envia à nuvem enquanto a sincronização estiver pausada.

## Evidências
- 303 testes unitários PASS; build PASS.
- Chromium: seletores e envio das escolhas PASS em 1366x768 e 412x915, serviço de nuvem simulado.
- Backups PC/G75: replay PASS com base comum reconstruída e servidor simulado. Resultado: 8 ativos, 1 arquivado; Rodrigo G75 R$757,14 ativo, PC R$1060 arquivado; Abimaer renumerado para orc_008. Fotos comerciais e fotos por etapa do G75 preservadas.
- Os exports não incluem o estado de sincronização do aparelho: esse replay NÃO comprova a base comum original.
- Não homologado no G75 físico nem na nuvem real. Nenhum dado da nuvem foi alterado por esta preparação.

## Teste manual
1. Abrir no G75 e confirmar o marcador `sync-v2-20261027-r4` e sincronização pausada.
2. Configurações > Comparar alterações em conflito.
3. `orc_004`: Manter todos ativos e corrigir numeração.
4. `orc_007`: manter ativo ID `orc_mvpvb3zd_tvvyp`, R$757,14, arquivar os demais.
5. Conferir individualmente os outros conflitos completos antes de escolher versões; não escolher tudo por data.
6. Aplicar e conferir 8 ativos sem números repetidos, Rodrigo de R$1060 em Arquivados, fotos e cópia preventiva.
7. Só então retomar sincronização; verificar conteúdo e mesma revisão no PC e no G75. Se surgirem novos conflitos, comparar novamente antes de substituir.
