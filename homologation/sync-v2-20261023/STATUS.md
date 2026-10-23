# Sincronização V2 — desenvolvimento — 23/10/2026
## Estado e limites
NÃO PUBLICADA. Produção e homologação instalada permanecem na revisão 3546f87.
Escopo somente sincronização. Nenhum dado de cliente, backup real ou senha integra este pacote.
Origem: candidata de sincronização validada pelo usuário no fluxo PC → Android → PC em 22/10.

## Implementado e testado
- Comparação de três versões (base comum reconhecida, aparelho, nuvem) por coleção e ID.
- Combinação de registros independentes. Alterações no mesmo registro pedem decisão; campos não são combinados automaticamente.
- Exclusão versus edição, numeração repetida e vínculos apagados geram conflitos.
- Operações financeiras/execução concorrentes e orçamento aprovado exigem revisão no módulo de origem; não são resolvidos por escolha genérica.
- Fila durável local derivada do banco e da base reconhecida, inclusive sem rede. Ao reconectar usa revisão remota e reenvio idempotente.
- Recebimento integral bloqueado quando aparelho já vinculado tem alterações locais não enviadas.
- Resolução explícita de registros comuns com validação da revisão e cópia preventiva.
- Recuperação seletiva de registros ausentes (clientes, categorias, metas e orçamentos sem aprovação), preservando existentes. Não reverte pagamentos.
- Retomada após pausa sem obrigar substituição da base.
- Nenhuma alteração na versão, nome ou esquema do banco operacional.

## Evidências locais
287 testes aprovados, zero falhas; compilação Vite aprovada.
Casos: duas criações independentes; divergência; exclusão versus edição; reenvio após timeout; editor aberto; comparação vencida; recuperação sem substituir atual; bloqueio de financeiro/aprovado; colisão de número; vínculo órfão.
Aviso de bundle grande permanece.
SHA256 do source.zip: 0d0ce2ff206d86dd9985c1cd4d5d653efc1b42883c20a8e411d3a111c8960081

## Não verificado / ainda pendente
- Interface em navegador e Android dos novos controles.
- Corte de rede real, fechamento/reabertura e atualização com dados pendentes.
- Recuperação efetiva no aparelho e conferência independente.
- Recuperação integral de financeiro, execução e aprovados com regras próprias (não implementada aqui).
- Envio incremental por registro no servidor: NÃO implementado. Transporte e persistência remotos continuam snapshots atômicos versionados; a combinação é por registro no cliente. Mantém limites de tamanho/volume de cópias.
- Combinação automática de campos diferentes do mesmo registro: não implementada por segurança.
- Limites da restauração e resolução precisam ser apresentados na homologação antes de qualquer substituição da versão instalada.

## Referências
https://supabase.com/docs/guides/auth/sessions
https://supabase.com/docs/guides/database/postgres/row-level-security
