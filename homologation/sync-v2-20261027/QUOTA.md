# Correção de quota — 27/10/2026

Causa comprovada nos logs do PostgreSQL às 22h42 BRT: Backup quota reached; export copies before maintenance.
Antes: soma por owner_id, compartilhada entre homologacao e homologacao_v2. Histórico: 11,97 MiB + 49,61 MiB; o envio seguinte excedia 64 MiB.
Depois: soma por owner_id E namespace. Teto permanece 64 MiB por conta neste ambiente; envio permanece limitado a 8 MiB.
Nenhuma cópia apagada ou cabeça sincronizada substituída.
Migração aplicada: isolate_sync_backup_quota_by_account_and_namespace.
Validação servidor: chamada da RPC como authenticated em transação com rollback, com a versão39 como payload; aceita próxima revisão e rollback preserva revisão39 e 39 cópias V2. Anon continua sem EXECUTE; autenticação, search_path e permissões da RPC preservados.
315 testes locais PASS. Inclui mensagens específicas para quota e tamanho do envio.
Advisors mantêm advertências preexistentes: RPC SECURITY DEFINER intencional com auth.uid e owner_id; proteção de senhas vazadas desabilitada. Nenhuma dessas configurações foi ampliada por esta correção.
Referências: https://supabase.com/docs/guides/database/functions e https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
A confirmação final do envio do G75 e recebimento no PC continua pendente.
