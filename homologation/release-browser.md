# Homologação Externa — Browser/IndexedDB

Gerado em: 2026-10-06T13:06:30.363Z
Snapshot: `/tmp/oficinaos/homologation/fixtures/external-smoke-backup.json`
Sintético CLEAN: **SIM**

Resultado: **PASS**

## Gates

- pageLoads: **OK** — shell OficinaOS carregado
- noDuplicateHtmlIds: **OK** — 0 IDs duplicados
- cleanBootNoOperationalData: **OK** — Inicialização sem dados operacionais fictícios
- indexedDbImportCounts: **OK** — contagens IndexedDB após importação comparadas ao snapshot
- indexedDbImportCriticalHashes: **OK** — hashes críticos idênticos
- indexedDbFinancialSignatures: **OK** — assinaturas Financeiro/Contas idênticas
- indexedDbReloadPersistence: **OK** — persistência exata após reload
- moduleNavigation: **OK** — 13 módulos navegados
- chromiumPdfFile: **OK** — PDF real gerado pelo Chromium
- commercialPdfBrowserPrivacy: **OK** — print chamado 1x e sem campos internos
- pdfDoesNotPersist: **OK** — PDF preserva todos os stores, incluindo IDs, tipos e timestamps
- pdfDraftPreview: **OK** — PDF reflete o rascunho atual
- pdfUnsavedEditsNotPersisted: **OK** — PDF de rascunho não grava alterações em nenhum store
- newDraftPdfDoesNotPersist: **OK** — PDF de orçamento novo não cria registros
- browserExportRoundTrip: **OK** — exportação UI preserva hashes críticos
- uiReimportReload: **OK** — reimportação em banco limpo e reload preservam todos os stores
- noPageErrors: **OK** — 0 page errors
- noConsoleErrors: **OK** — 0 console errors

## Limite

Um PASS com fixture sintética prova build/browser/IndexedDB/UI/reload/PDF/exportação no ambiente externo, mas não substitui o gate de contagens do snapshot oficial.
