# Correção da confirmação de sincronização — Sync V2 R2 — 23/10/2026

## Diagnóstico comprovado
Os backups enviados do PC e do Android contêm orçamentos com IDs distintos e mesmo número comercial. A consulta somente de leitura do servidor confirmou que a revisão 1 contém o orçamento do PC e a revisão 2 contém apenas o do Android. Ambas as versões permanecem na nuvem. Nenhum payload do usuário foi incluído no repositório.

Não é possível determinar, apenas pelos backups, a sequência exata de ações que produziu a segunda revisão. A divergência dos backups exportados em horários distintos não prova, sozinha, que os aparelhos consultaram a mesma revisão ao mesmo tempo.

Brechas identificadas/reproduzidas em testes:
- O caminho de revisão inalterada confiava na identidade local salva sem conferir o payload remoto.
- Envio aceito e leitura confirmada eram tratados como equivalentes.
- A mensagem de sucesso anterior podia permanecer após edição local.
- Um orçamento ausente podia ser interpretado como exclusão sem evidência no fluxo de lixeira.
- Primeiro recebimento explícito podia substituir orçamentos próprios de outro aparelho.

## Correções
- Todo estado de sucesso relê nuvem e banco local, compara conteúdo canônico completo e valida revisão.
- Divergência na mesma revisão bloqueia; mudança durante a conferência gera pendência, nunca sucesso.
- Envio aceito sem confirmação por falha de rede permanece não confirmado; repetição não duplica revisão.
- Edição local sinaliza formulário pendente; salvamento sinaliza envio pendente.
- Tela identifica ambiente homologacao_v2, build sync-v2-20261023-r2, última revisão e quantidade de orçamentos conferidos.
- Texto deixa explícito que a conferência deste aparelho com a nuvem não confirma recebimento no segundo aparelho.
- Ausência de orçamento sem registro correspondente em trash/archivedBudgets bloqueia envio, recebimento automático, explícito e resolução genérica. Exclusão legítima com lixeira continua permitida.
- Primeiro recebimento bloqueia orçamento próprio cujo ID está ausente da nuvem.
- Cache atualizado somente no escopo V2. Nomes dos bancos, sessão e namespace V2 preservados. Sem limpeza de dados.
- Sync V1, main e dados da nuvem não foram modificados.

## Verificação
296 testes unitários aprovados e build local aprovado.
8 regressões adicionais: mesma revisão/conteúdo diferente; gravação local durante confirmação; rede indisponível após envio; substituição sem exclusão; remoção remota sem lixeira; primeiro recebimento com orçamento próprio; exclusão legítima.
A verificação de CI e publicação é vinculada ao commit deste relatório.

## Limites e próximo passo
A correção não unifica automaticamente as duas cópias existentes nem renumera documentos já emitidos.
Os dois orçamentos têm o mesmo número comercial, e não há base comum comprovada que autorize decidir exclusões automaticamente.
Manter os backups do PC e Android e as revisões 1 e 2. Não importar dados reais nem substituir Sync V1.
Homologar novamente no PC e Android após confirmar build R2 em ambos.
Sem aprovação final do teste físico. Não declarar homologação concluída com testes unitários.
