# Backup oficial saneado — 06/10/2026

O usuário autorizou desvincular 11 fromTx sem alvo. Todos os lançamentos e campos financeiros foram mantidos. O original está preservado em ../2026-10-05. O histórico individual das alterações é privado.

SHA-256 do snapshot saneado: e9df0c002e4e5efb4e99f7e790939068886896711ff1699d0d4ee3f923c96945.

Este backup foi homologado com parecer GO na execução privada integral. É publicado criptografado AES-256-GCM porque contém dados de clientes. A chave está somente no pacote privado entregue ao proprietário. Não publique esse pacote nem a chave.

Restauração:

```sh
node restore-official-backup.mjs /caminho/chave-backup-saneado.txt /caminho/OficinaOS-backup-2026-10-06-saneado.json
```

O script autentica o conteúdo, confere o SHA-256 e não sobrescreve arquivos existentes.
