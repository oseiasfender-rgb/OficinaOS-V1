# OficinaOS-V1 — Especificação de aceitação v1

Especificação nova autorizada pelo usuário em 06/10/2026. Não é recuperação da definição histórica. Referência autorizada: OficinaOS-backup-2026-10-05.json, SHA-256 8edaf955eccd9f56aa373825a379a667fcd719e46e768a4928b4fe4a1857a239. A proposta-v1 aprovada para implementação tem SHA-256 56ce47d31ec8ee51ca84c403f47d033e6b2a13f66ee5ea4c8e1d574fa9614361.

## Identidade e vínculos

Identidade da origem = coleção + posição + ID tipado + ocorrência. Preservar todos os registros e todos os campos originais. Para ALL_TX, primeira ocorrência mantém ID; demais recebem String(ID)__dupN e legacyId original. Colisão com outro ID bloqueia cálculo. Não deduplicar registros, não gerar transações substitutas e não alterar o backup original. Outras coleções com IDs inválidos ou repetidos bloqueiam a projeção.

Vínculos de contas fromTx/paidTxId: referência vazia não aponta entidade; referência preenchida deve resolver. Um único candidato resolve por ID. IDs repetidos exigem um único candidato com val e date tipadamente iguais a val e paidAt da conta; o ID de destino desse candidato deve coincidir com a referência mantida. Caso contrário: AMBIGUOUS. Sem candidato: UNRESOLVED. Qualquer caso AMBIGUOUS ou UNRESOLVED reprova sourceLinksValid. Não escolher pelo nome ou por aproximação de valor/data.

## Expectativa independente

O módulo scripts/acceptance-auditor.mjs não importa importador, serviços ou normalizadores de produção. Escopo fechado: backup plano version 1.0 com os campos inventariados neste módulo. Campo novo, estrutura diferente ou estoque não vazio exige revisão da matriz. Campos originais, inclusive listas/objetos aninhados de clientes e de configurações, são preservados por cópia profunda, sem seleção silenciosa.

ALL_TX → transactions (identidade conforme regra acima); contas → accounts (cópia integral + category=cat); clientes → clients (cópia integral + name=nome); jobs → jobs (cópia integral + budgetId=null); metasCat → goals (cópia integral + ID determinístico goal_N e category=cat); estoque e coleções não presentes: expectativa vazia. Jobs geram uma OS e um agendamento por linha, com IDs os_ID/ag_ID e vínculo à mesma ocorrência. A projeção explicita todos os campos adicionais, defaults e transformações no código auditado. Nome do cliente vincula por comparação trim/minúsculas pt-BR; cliente não localizado mantém null, sem criar cliente. Datas aceitam ISO yyyy-mm-dd e truncam hora; criação desconhecida é null. Status depende somente de done neste escopo. Metadata source/version/schema e configurações metaPrincipal/nextTxId/dasStatus têm gates próprios, fora dos 18 STATE_STORES. migratedAt é instante técnico válido, não data histórica; não se exige igualdade à exportação, e sim preservação no round-trip.

## Métricas

E = multiconjunto de registros esperados; A = multiconjunto lido de cada um dos 18 stores. Fingerprint SHA-256 de JSON com chaves de objeto ordenadas, tipos originais e listas internas em ordem. null difere de ausência.

derivedCount = soma_f max(a(f)-e(f),0).
missingExpectedCount = soma_f max(e(f)-a(f),0).

Registros técnicos autorizados entram em E e também são comparados. Informar authorizedTechnicalDerivedCount separadamente (74 nesta referência: 37 OS + 37 agendamentos). Cada campo esperado participa da comparação, inclusive ID, valor, vínculo, timestamp e campos legados preservados. Não usar hashes do importador para construir E.

Calcular depois de importação, reload, navegação, imediatamente antes do PDF, PDF, PDF de edição não salva, PDF novo, exportação, reimportação antes do reload e segundo reload. Todos os resultados devem usar o mesmo SHA de fonte e contrato. Registros excedentes/ausentes listados por fingerprint e multiplicidade; IDs duplicados no destino são gate independente. Nenhum erro pode virar zero.

## GO

GO exige zero em ambas as métricas em todas as etapas, fieldCoveragePass, settingsPreserved, metadataValid, sourceLinksValid, ausência de IDs duplicados no destino e todos os gates técnicos. Zero nas métricas não dispensa integridade referencial da origem. Problemas da origem devem ser relatados sem atribuir perda ao importador.
