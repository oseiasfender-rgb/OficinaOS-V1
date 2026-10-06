# OficinaOS — Release Candidate homologada

Release limpa derivada da Homologação Externa Final.

- Commit GO de origem: `0e62dbd4e21e5347f996af0a8806b041992d2666`
- GitHub Actions de homologação: `37465897760`
- Snapshot saneado homologado SHA-256: `e9df0c002e4e5efb4e99f7e790939068886896711ff1699d0d4ee3f923c96945`
- Saneamento autorizado: 11 referências `fromTx` sem destino removidas; campos financeiros preservados.
- Resultado privado integral: GO.
- O Actions público usa somente fixture sintética CLEAN.
- O backup real criptografado permanece exclusivamente na branch de homologação e não integra esta release.
- Esta branch não representa implantação em produção e não altera `main`.

## Escopo do manifesto de release

`RELEASE_SHA256SUMS.txt` cobre o código, testes, configuração, fixture CLEAN e documentação pública da release. Arquivos em `.github/` são deliberadamente excluídos para permitir evolução independente do CI sem alterar o hash do código homologado. Evidências de execução (screenshots, PDF e export temporário) permanecem nos logs/artefatos do Actions e não são versionadas na release.
