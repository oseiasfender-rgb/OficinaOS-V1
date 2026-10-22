# Sincronização PC e Android — homologação — 21/10/2026
Base: Orçamento bba753ffa13a9490d5479312ac04290bcf8f138a. Produção main preservada.
## Implementado
Supabase Auth por e-mail/senha; dados privados por auth.uid(); snapshots completos versionados; comparação de revisão e operação idempotente; bloqueio de conflito e de formulário em edição; cópia local antes de receber; envio inicial somente por escolha explícita; namespace e IndexedDB isolados.
Cópias somente com aplicativo aberto, online e sincronização habilitada. Nenhum dado real foi importado.
Limites da aplicação: 8 MiB por snapshot, 64 MiB de versões por conta; sem expurgo automático. Não substitui backup externo independente.
## Evidências
264 testes locais aprovados; build aprovado (aviso de chunk >500 kB).
SQL transacional com rollback: isolamento de duas contas, envio idempotente, conflito de revisão. Zero contas e zero snapshots persistidos na conferência de 21/10.
Advisors: RPC SECURITY DEFINER intencional exige auth.uid e nega chamada anônima; aviso do linter documentado. Gatilho interno teve execução pública revogada.
## Não verificado
Cadastro e confirmação de e-mail real; primeira sincronização autenticada PC/Android; retomada offline real; restauração no aparelho; WhatsApp e PIX reais.
## Ativação
Configurar Site URL no Supabase Auth URL Configuration para https://oseiasfender-rgb.github.io/OficinaOS-V1/homologacao/sincronizacao/.
Criar acesso e confirmar e-mail; entrar em ambos. Exportar JSON do sistema anterior e importar na homologação apenas no aparelho origem. Conferir dados antes de enviar. No segundo aparelho receber da nuvem.
Conflitos nunca mesclam nem substituem silenciosamente; exportar ambas as bases antes de escolher.
