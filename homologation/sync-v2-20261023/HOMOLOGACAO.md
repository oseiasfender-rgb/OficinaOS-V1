# Sync V2 — homologação isolada — 23/10/2026

Status: candidata em homologação; NÃO liberada para substituir Sync V1.
Endereço previsto: https://oseiasfender-rgb.github.io/OficinaOS-V1/homologacao/sincronizacao-v2/

## Evidência técnica
- 288 testes unitários aprovados; build local aprovado.
- Banco operacional: oficinaos_homologacao_sync_v2_20261023.
- Metadados: oficinaos_sync_device_v2_20261023.
- Sessão: oficinaos_auth_homologacao_v2_v1; chave oficinaos-auth:homologacao_v2.
- Namespace remoto: homologacao_v2; namespace homologacao da Sync V1 preservado.
- Teste adicional confirma que sessão e habilitação V1 não são herdadas.
- Servidor: teste transacional descartado por ROLLBACK confirmou revisão inicial, repetição idempotente, rejeição de revisão antiga e preservação dos namespaces existentes.
- Revisão V1 observada antes e depois: 21, fingerprint 0bae4e54f7139a87a98d89a923d4d155.
- Atualização da candidata mantém o nome do banco V2 e não limpa dados locais.
- Recuperação carregada no bundle inicial para evitar dependência de chunk ainda não armazenado offline.

## Limites / bloqueios de liberação
- Falta teste físico PC ↔ Android: conflito, offline/reconexão, recuperação e atualização com dados pendentes.
- Recuperação seletiva adiciona apenas clientes, categorias, metas e orçamentos não aprovados ausentes. Não restaura automaticamente financeiro ou execução; não substitui registros existentes.
- Conflitos financeiros, aprovações, exclusões vinculadas e números comerciais repetidos exigem revisão no módulo de origem.
- Edições concorrentes do mesmo registro não são mescladas campo a campo.
- Transporte continua por snapshot completo, máximo 8 MiB/envio e 64 MiB de versões por conta, compartilhado entre namespaces.
- Advisors: RPC SECURITY DEFINER autenticada intencional, com auth.uid, validação, CAS e RLS para leitura. Proteção contra senhas vazadas desabilitada já existente; nenhum ajuste pago foi ativado.
- Não importar backup real durante homologação. Usar apenas registros fictícios.
- main e source.zip da Sync V1 não são alterados.

## Roteiro físico
1. Abrir o link V2 nos dois aparelhos e entrar com o acesso existente. Não criar outra conta.
2. Criar cliente TESTE V2 PC; salvar; no PC escolher origem inicial. No Android receber dados da nuvem. Confirmar o cliente.
3. Com ambos offline, criar clientes de nomes diferentes. Salvar e reabrir para verificar persistência. Reconectar, sincronizar até ambos conterem os dois.
4. Offline, alterar o mesmo cliente com textos diferentes. Reconectar: exigir comparação, preservar ambas as versões, escolher conscientemente a versão e conferir convergência.
5. Consultar cópias; prévia de recuperação; recuperar somente um registro fictício ausente. Confirmar que os registros atuais permanecem.
6. Criar alteração pendente, fechar/reabrir/recarregar a candidata e reconectar. Conferir envio sem perda nem duplicação.
7. Confirmar que a instalação V1 conserva seus dados. Registrar resultado, data e aparelhos antes de autorizar substituição.

SHA256 source.zip: cdc69369aa59ba1ea4f005e7b37728d8feee8ee90fa80ed3c9ce13b37112027b
