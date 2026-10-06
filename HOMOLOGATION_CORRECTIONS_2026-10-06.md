# Correções e rechecagem de 06/10/2026

Financeiro e Contas consultam projeções normalizadas sem persistir reconciliação, gerar transações ausentes, sincronizar OS ou gerar recorrentes durante a navegação. A geração de recorrentes continua disponível por comando explícito. O checklist consultado é transitório até a primeira edição explícita.

Três testes de regressão verificam a preservação integral dos repositórios durante consultas, a ausência de geração automática de recorrentes e a persistência do checklist somente após edição. 94 testes, build Vite, serviços e 18 gates de navegador aprovados na execução privada com snapshot oficial.

Snapshot oficial SHA-256: `8edaf955eccd9f56aa373825a379a667fcd719e46e768a4928b4fe4a1857a239`.

Auditor independente: derivedCount=0 e missingExpectedCount=0 em import, reload, navigation, beforePdf, pdf, pdfUnsavedEdit, pdfNewDraft, export, reimport e reimportReload. O contrato e o auditor anteriores foram preservados; nenhuma expectativa foi relaxada.

Parecer **NO-GO**: sourceIdentityLinks e acceptanceMetricsVerified permanecem bloqueados porque o aceite inclui integridade dos vínculos. 11 referências fromTx já não possuem alvo na origem. Um ID aparece no backup de 03/10, mas o valor/data não correspondem simultaneamente; um outro registro tem candidato por valor/data, sem identidade comprovada. Nenhuma referência ou lançamento foi inventado, excluído ou remapeado.

O GitHub Actions usa fixture sintética; sucesso técnico do job não equivale a GO com dados oficiais. O backup real é publicado criptografado; a chave e a investigação individual permanecem privadas. Main não foi alterada.
