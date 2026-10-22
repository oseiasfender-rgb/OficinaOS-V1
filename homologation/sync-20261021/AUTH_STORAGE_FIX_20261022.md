# Correção de persistência da sessão — 22/10/2026
Erro observado: QuotaExceededError ao salvar oficinaos-auth:homologacao em localStorage.
Sessão movida para IndexedDB separado por ambiente, não exportado nem sincronizado. Migração da sessão anterior somente após persistência; nenhuma limpeza de dados operacionais. Sem fallback volátil silencioso.
267 testes aprovados e build aprovado. Testes novos: localStorage cheio, persistência após reabertura, migração seletiva, saída, storage legado indisponível e isolamento de ambientes.
Login real no PC/Android após atualização ainda requer conferência do usuário. Sem alteração de senha ou cadastro.
