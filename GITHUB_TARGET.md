# Repositório-alvo da Homologação Externa

Repositório oficial informado pelo usuário:

`https://github.com/oseiasfender-rgb/OficinaOS-V1`

## Estratégia de publicação

- Não sobrescrever a branch principal durante a homologação.
- Criar branch dedicada: `homologacao/oficinaos-v0.9.1-rc1`.
- Publicar o kit de homologação externa nessa branch.
- Workflow principal: `.github/workflows/homologacao-externa.yml`.
- Executar primeiro sem snapshot oficial, validando build/browser/IndexedDB/E2E sintético.
- Executar o gate de snapshot oficial somente quando `official-snapshot.json.gpg` e o secret de senha estiverem disponíveis.
- Merge para a branch principal somente após parecer GO formal.

## Resultado esperado do CI

O workflow deve produzir artefatos de evidência contendo:

1. resultado dos testes unitários;
2. build Vite;
3. logs Playwright;
4. screenshots dos módulos críticos;
5. resultado de reload do IndexedDB;
6. resultado do fluxo Cliente → Orçamento → Agenda → OS → Checklist → Entrega → Financeiro;
7. exportação/reimportação e hashes críticos;
8. relatório de auditoria do snapshot oficial, quando presente;
9. parecer final GO/NO-GO.

## Regra de segurança

Nenhum backup real em JSON aberto deve ser commitado. O snapshot oficial deve permanecer criptografado (`.gpg`) ou ser fornecido pelo runner por mecanismo seguro.
