# Backup oficial — OficinaOS-V1

Snapshot de 05/10/2026, preservado byte a byte e criptografado com AES-256-GCM porque este repositório é público e o arquivo contém dados de clientes.

SHA-256 original: `8edaf955eccd9f56aa373825a379a667fcd719e46e768a4928b4fe4a1857a239`.

A chave não está neste repositório. Foi entregue separadamente ao proprietário no pacote privado de evidências. Não publique a chave, o backup restaurado ou esse pacote privado.

Restauração (Node.js):

```sh
node restore-official-backup.mjs /caminho/chave-backup-oficial.txt /caminho/OficinaOS-backup-2026-10-05.json
```

O script autentica o conteúdo e valida o SHA-256 dos bytes originais antes de escrever o arquivo. Recusa sobrescrever um arquivo existente.

Parecer da execução com este snapshot: **NO-GO**. As métricas são 0/0 nas dez etapas, mas há 11 referências financeiras sem destino comprovado no snapshot de origem. Este backup é evidência; sua publicação não concede aprovação de produção.
