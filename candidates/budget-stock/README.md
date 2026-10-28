# Candidata Estoque r1 — 28/10/2026

TESTES SOMENTE. Banco local oficinaos_homologacao_estoque_20261028 e nuvem homologacao_estoque_v1. Sessão, metadados e saldos separados da r5 e produção. Inicia vazia e pausada, sem importação automática. Não substitui aplicativos instalados.

Baixa ao salvar orçamento: material selecionado do Estoque, peça selecionada do catálogo. Editar ajusta diferença; excluir linha devolve somente quantidade debitada; salvar novamente não repete débito. Saldo insuficiente reverte a gravação completa. Itens manuais sem vínculo não baixam automaticamente. Orçamentos antigos importados não têm baixa retroativa. Arquivar ou lixeira não devolvem automaticamente.

A OS aproveita quantidade já debitada pelo orçamento e baixa só o excedente. Devolução não reabre crédito reutilizável. Revisão antes da OS transfere alocação sem nova baixa. Ajuste de orçamento já vinculado à execução exige registro de consumo/devolução na OS. Operações concorrentes de saldo são bloqueadas para análise, não reconciliadas automaticamente.

Validado localmente: 323 testes; build; Chromium 1366x768 e 412x915 com IndexedDB real, serviços reais e dados de teste. Inclusão sem salvar preserva saldo; salvar, repetir, editar, insuficiência, duplicação e fotos conferidos. Não equivale à validação física PC/Android.

## Teste nos aparelhos

Abra a candidata Estoque r1. Não importe os backups da r5 para este primeiro teste. No PC, cadastre um material com saldo 10 e custo informado e uma peça com saldo 5 e foto; crie orçamento de teste incluindo 2 unidades do material e 1 peça. Salve e confira saldos 8 e 4. Salve novamente: devem continuar 8 e 4. Aumente material a 3 e salve: saldo 7. Antes de qualquer edição no Android, envie a cópia inicial do PC pelo botão Usar este aparelho como origem; no Android, com a mesma conta e ambiente, Receber dados da nuvem. Confira mesmo orçamento, foto, saldos e revisão. Faça as edições em um aparelho por vez e sincronize antes de passar ao outro. Quantidades acima do saldo devem bloquear orçamento e baixa integralmente.

## Supabase

A migração adiciona somente o ambiente homologacao_estoque_v1 à lista permitida. Mantém auth.uid(), isolamento por dono, RLS, execução anônima revogada, limites de 8 MiB/64 MiB por conta e ambiente e todos os backups. RPC validada em transação revertida; novo ambiente permaneceu sem registros. Avisos de segurança pré-existentes não foram introduzidos: RPC security definer autenticada intencional e proteção de senhas vazadas desativada. Referências: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .
