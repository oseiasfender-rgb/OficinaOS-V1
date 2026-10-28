# Candidata Estoque r1 — 28/10/2026

TESTES SOMENTE. Banco local oficinaos_homologacao_estoque_20261028 e nuvem homologacao_estoque_v1. Sessão, metadados e saldos separados da r5 e produção. Inicia vazia e pausada, sem importação automática. Não substitui aplicativos instalados.

Baixa ao salvar orçamento: material selecionado do Estoque, peça selecionada do catálogo. Editar ajusta diferença; excluir linha devolve somente quantidade debitada; salvar novamente não repete débito. Saldo insuficiente reverte a gravação completa. Itens manuais sem vínculo não baixam automaticamente. Orçamentos antigos importados não têm baixa retroativa. Arquivar ou lixeira não devolvem automaticamente.

A OS aproveita quantidade já debitada pelo orçamento e baixa só o excedente. Devolução não reabre crédito reutilizável. Revisão antes da OS transfere alocação sem nova baixa. Ajuste de orçamento já vinculado à execução exige registro de consumo/devolução na OS. Operações concorrentes de saldo são bloqueadas para análise, não reconciliadas automaticamente.

Validado localmente: 323 testes; build; Chromium 1366x768 e 412x915 com IndexedDB real, serviços reais e dados de teste. Inclusão sem salvar preserva saldo; salvar, repetir, editar, insuficiência, duplicação e fotos conferidos. Não equivale à validação física PC/Android.

## Teste nos aparelhos

Abra a candidata Estoque r1. Não importe os backups da r5 para este primeiro teste. No PC, cadastre um material com saldo 10 e custo informado e uma peça com saldo 5 e foto; crie orçamento de teste incluindo 2 unidades do material e 1 peça. Salve e confira saldos 8 e 4. Salve novamente: devem continuar 8 e 4. Aumente material a 3 e salve: saldo 7. Antes de qualquer edição no Android, envie a cópia inicial do PC pelo botão Usar este aparelho como origem; no Android, com a mesma conta e ambiente, Receber dados da nuvem. Confira mesmo orçamento, foto, saldos e revisão. Faça as edições em um aparelho por vez e sincronize antes de passar ao outro. Quantidades acima do saldo devem bloquear orçamento e baixa integralmente.

## Supabase

A migração adiciona somente o ambiente homologacao_estoque_v1 à lista permitida. Mantém auth.uid(), isolamento por dono, RLS, execução anônima revogada, limites de 8 MiB/64 MiB por conta e ambiente e todos os backups. RPC validada em transação revertida; novo ambiente permaneceu sem registros. Avisos de segurança pré-existentes não foram introduzidos: RPC security definer autenticada intencional e proteção de senhas vazadas desativada. Referências: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable e https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .


## Correção 1 — editor do catálogo e proteção do saldo (28/10/2026)

Build estoque-20261028-r1-fix1, mesmo banco local e mesmo ambiente homologacao_estoque_v1. Não modifica saldos existentes automaticamente.

Um backup enviado pelo usuário mostrava alocação de 5 Paralama no orçamento, baixas registradas e cadastro final com 10 disponíveis. Isso comprova divergência entre histórico e cadastro, mas não prova se houve reposição física ou qual ação do usuário produziu o saldo final. A análise identificou e reproduziu um caminho de sobrescrita: editor de catálogo aberto antes da baixa pode salvar a quantidade antiga depois dela.

Correção: atualização de peça e baixa agora disputam a mesma transação de settings. Salvar ou excluir cadastro exige snapshot atual da peça; edições antigas são rejeitadas sem alterar saldo/foto. Excluir peça com alocação de orçamento é bloqueado. Ajuste manual de quantidade exige confirmação explícita na interface e registra antes/depois em settings. Inclusão de outra peça não sobrescreve saldo de cadastros existentes. Todos os backups e fotos são preservados.

Validação: 326 testes passaram, build e interface desktop/mobile passaram com o fluxo completo pricingVersion 2. Novo teste abre editor, baixa pelo orçamento, tenta salvar editor antigo, verifica rejeição e saldo preservado. Replay isolado do backup reproduz a proteção e verifica arquivo original intacto. Backup, fotos e dados pessoais não foram incluídos no GitHub.

Conferência no aparelho: antes de editar, confira o build em Configurações. Reabra o catálogo; para testar a correção use um orçamento de teste com uma nova peça, saldo 10 e quantidade 5. Ao salvar orçamento, deve ficar 5. Salvar novamente deve manter 5. Não force nova baixa no orçamento anterior; o ledger já registra suas 5 unidades. O saldo atual do cadastro Paralama deve ser conciliado com a contagem real, sem inferência automática a partir de registros incompletos.


## Correção 2 — clareza de unidades e conferência do ciclo completo

Build estoque-20261028-r1-fix2, mesmo banco e ambiente. Campo Quantidade disponível da peça (unidades); novo cadastro não presume uma unidade. Indicadores de tipos de peças separados do total de unidades. Linhas mostram disponível/já baixado e avisam quando são avulsas sem baixa. Confirmação de salvar diferencia ajuste de estoque de salvamento sem nova baixa. Edição parcial do cadastro preserva quantidade/foto e envio duplicado do formulário é bloqueado. Materiais com baixa de orçamento também são protegidos contra exclusão, troca de unidade e edição obsoleta do saldo.

Registro de fechamento: ENCERRAMENTO_ORCAMENTO_20261028.md. Testes ampliados incluem devolução ao excluir linha, reabertura na aplicação completa, novo salvamento sem débito repetido, peça avulsa sem movimentação e ausência de rolagem horizontal. Documento comercial e consumo da OS também verificados. Homologação física de saldos e revisão entre PC/G75 continua pendente; produção não foi liberada.

## Correção 3 — janela de Peças semelhante à de Materiais

Build estoque-20261028-r1-fix3. O botão Escolher do catálogo e os indicadores por condição abrem uma janela modal de Peças com busca, filtro, fotos, unidades disponíveis e ações Usar no orçamento, Editar e Excluir. Cadastro/edição usam uma segunda janela, sem expandir formulário no orçamento. Fechar e Escape disponíveis; alterações não salvas no editor pedem confirmação para descartar. Durante a preparação da foto e gravação, o envio repetido é bloqueado. Busca/filtro são consultas e não marcam o orçamento como editado para a sincronização.

Mantidos IDs, fotos, unidades, proteção contra edição obsoleta e baixa somente ao salvar o orçamento. Mesmo banco local, conta e ambiente, sem alteração automática de dados ou publicação na produção.

Validação: 329 testes, build e testes de interface desktop/mobile passaram. Janela testada com busca, filtro, cadastro com foto PNG válida, verificação de decodificação das fotos, edição obsoleta, descarte/cancelamento, Escape e ausência de rolagem horizontal. Validações anteriores de saldo e documentos permanecem no workflow.
