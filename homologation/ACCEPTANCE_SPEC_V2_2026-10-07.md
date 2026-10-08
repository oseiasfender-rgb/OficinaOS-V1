# OficinaOS-V1 — Especificação de aceitação v2

Revisão da matriz v1 autorizada pela continuidade de 07/10/2026. A especificação v1 histórica permanece preservada. Esta revisão amplia cobertura de estoque; não altera schema, importador, UI ou regras financeiras.

## Escopo fechado e preservação

Backup plano version 1.0 com as mesmas estruturas da v1. Estoque pode estar preenchido. Campos de estoque cobertos: id, nome, name, cat, unid, qty, custo, unit, minimo, minQty, forn. Qualquer campo não inventariado, ID ausente/vazio ou repetido (incluindo colisão numérico/textual) bloqueia a projeção. Nenhum registro é descartado por deduplicação.

Cada item de estoque é copiado integralmente, mantendo tipos, unidades, quantidades, custos e aliases legados. Acrescentar somente name = name ?? nome ?? '' e category = cat ?? ''. Nome explícito é preservado mesmo se diferente de nome. Nenhuma conversão de unidade, arredondamento, substituição de custo ou material padrão é autorizada. Estoque vazio continua suportado.

As demais projeções, identidades, regras de fromTx/paidTxId, tratamento de IDs repetidos em ALL_TX e expectativas de configurações/metadata seguem integralmente a v1. As métricas comparam cada campo de estoque por fingerprint, como os demais stores. O auditor permanece independente do código de produção.

## Snapshot temporal e contrato

Um novo snapshot recebe contrato privado próprio, identificado pelo SHA-256 de seus bytes, da especificação e do auditor. O contrato declara expectedCounts para os 18 stores; estas contagens devem coincidir com a projeção independente. Não copiar contagens de um snapshot antigo como requisito para um novo. Os alvos históricos e o snapshot original não são sobrescritos. Contrato com SHA incorreto, documento/auditor divergente ou contagens incompatíveis bloqueia execução.

O contrato privado pode ser passado por ACCEPTANCE_CONTRACT. Contratos históricos usam a mesma regra de verificação e continuam ligados ao seu snapshot. Se o auditor mudar, qualquer contrato deve ser reidentificado; hashes antigos não são aceitos silenciosamente.

## Integridade e saneamento

fromTx/paidTxId preenchidos exigem destino inequívoco conforme v1. Sem candidato: UNRESOLVED. Mais de um candidato sem resolução tipada: AMBIGUOUS. Ambos reprovam sourceLinksValid mesmo com métricas zero.

Saneamento autorizado neste trabalho: preservar bytes do original e criar cópia separada. Remover apenas fromTx cujo destino comprovadamente não exista em ALL_TX. Não criar ou remapear destino; não alterar pagamentos, valores, datas, IDs, recorrências, nomes, estoques ou metas. Registrar cada caminho alterado e o antes/depois em evidência privada, e comprovar igualdade dos demais campos. Assinatura financeira que inclua fromTx mudará por esse motivo; não declarar igualdade dessa assinatura entre original e saneado. Exigir igualdade integral das assinaturas do saneado durante importação, reload, exportação e reimportação.

## Métricas e gates

Fingerprint SHA-256 de JSON com chaves de objeto ordenadas, tipos originais e listas internas em ordem. Ausência difere de null.

- derivedCount = sum_f max(a(f)-e(f),0).
- missingExpectedCount = sum_f max(e(f)-a(f),0).

E é o multiconjunto esperado independente; A é o conteúdo efetivamente lido de cada store. OS e agendamentos derivados oficialmente entram em E e são contados separadamente em authorizedTechnicalDerivedCount. IDs duplicados no destino, sourceLinksValid, fieldCoveragePass, settingsPreserved e metadataValid são gates adicionais.

Calcular nas dez etapas: import, reload, navigation, beforePdf, pdf, pdfUnsavedEdit, pdfNewDraft, export, reimport, reimportReload. Ambas as métricas devem ser zero em todas. Configurações e metadata devem permanecer iguais às da importação nos reloads e no round-trip. PDF de rascunho não pode gravar registros.

GO exige todos os gates do finalizer: testes unitários, build Vite, serviços funcionais, navegador/IndexedDB, snapshot identificado, contagens e estrutura, métricas com identidade verificada e vínculos da origem. Fixtures sintéticas só validam o ambiente técnico público. Evidências de dados reais permanecem privadas e fora do repositório. GO para uma cópia saneada não autoriza o original nem comprova conteúdos ausentes na fonte (como orçamentos/checklists não exportados).

## Ambiente

Por padrão usar Chromium instalado pelo Playwright. Em ambiente que impeça seu download, um executável Chromium local pode ser informado por OFICINAOS_CHROMIUM_EXECUTABLE e argumentos JSON por OFICINAOS_CHROMIUM_ARGS. Registrar versão e uso de executável alternativo na evidência. Nenhum resultado em memória substitui navegador real ou PDF real.
