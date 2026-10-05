# OficinaOS-V1 — Correções da homologação de 05/10/2026

## Correção do PDF

O botão PDF comercial monta um registro transitório a partir do rascunho e não chama save(). A geração do PDF não cria orçamento, não altera IDs, vínculos, tipos, timestamps nem histórico. O botão Salvar continua sendo responsável pela gravação. Edições não salvas aparecem no documento, mas não são persistidas automaticamente.

## Teste de conservação

O navegador compara todos os STATE_STORES, mantendo todos os campos nos hashes. Valida orçamento salvo, rascunho editado e orçamento novo. Exportação é comparada com o IndexedDB imediatamente anterior à exportação; reimportação acontece em banco limpo e é conferida depois do reload. A fixture é sintética e o contexto do navegador é isolado.

## Rastreabilidade

core83.tar.xz permanece íntegro com SHA-256 3098dc255631212bf4a8adf78b2c36cad90b36872ed9d426d648ebb370a9511e e manifesto original 2eb6f67a0fe4907ec5b517826763c2c6f62ae889209fa4670780f7043ddd8994. O workflow primeiro confere o núcleo original e só depois aplica arquivos versionados em .ci5/overrides. O manifesto patched-files.sha256 registra a versão efetivamente testada. Não atribuir o resultado corrigido aos bytes originais sem mencionar as correções.

## Snapshot oficial: preparação sem divulgação

O workflow público executa somente fixture sintética. O snapshot original e suas evidências reais devem permanecer fora do repositório. O validador privado verifica hash, recusa fixture sintética e exige as contagens oficiais antes de executar testes/build/navegador. Não envia dados ao GitHub.

Após instalar as dependências e Chromium na cópia corrigida, usar:

```bash
node scripts/homologate-official-private.mjs /pasta/privada/backup-oficial.json SHA256_REAL /pasta/privada/evidencias --preflight-only
node scripts/homologate-official-private.mjs /pasta/privada/backup-oficial.json SHA256_REAL /pasta/privada/evidencias
```

Na mesma máquina, liberar a porta local 4273 antes da execução. Manter diretório privado com acesso restrito. O SHA-256 deve vir do arquivo oficial identificado pelo responsável; coincidência de contagens não comprova origem. A execução privada completa permanece não validada enquanto o snapshot correto não for fornecido; as recusas de arquivo incorreto/sintético/hash divergente são testadas.

Alvos recuperados: transactions=2095, accounts=302, jobs=34, clients=5, goals=7, budgets=1. Os quatro backups disponíveis de junho/julho de 2026 não correspondem a todos esses alvos. Não completar artificialmente o backup para atingir contagens.

## Métricas oficiais

Não foi recuperada a definição algorítmica histórica de derivedCount/missingExpectedCount. O contrato homologation/acceptance-metrics-contract.json conserva o requisito de zero e registra fórmulas ausentes. Não atribui significado inventado aos nomes.

Para fechar o gate, fornecer a definição original com universo de registros, regras de proveniência/derivação, conjunto esperado e tratamento de duplicidades/normalização. Identificar a fonte por SHA-256, implementar algoritmo e testar casos de aprovação/reprovação. O resultado calculado deve corresponder ao mesmo SHA-256 do snapshot oficial e do contrato. ACCEPTANCE_METRICS_DEFINED=1 sozinho não libera GO.

Fonte documental recuperada: GATE_ACCEPTANCE_METRICS_2026-09-18.md e HOMOLOGATION_STATUS.md. Essas fontes registram ausência de definição; o contrato novo apenas torna esse bloqueio verificável, sem substituir ou reinterpretar a regra histórica.

## Decisão

PASS técnico sintético não concede GO final. Snapshot oficial, validação privada e cálculo das duas métricas continuam obrigatórios. main não recebe merge antes de todos os gates aprovados.
