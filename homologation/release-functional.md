# Homologação Funcional — OficinaOS Modular v0.9.1 RC1

Gerado em: 2026-10-06T13:06:27.612Z

Resultado: **PASS**

## Gates

- clientCreated: **OK** — clienteId=100
- budgetCalculation: **OK** — total=2250
- commercialPdfModelPrivacy: **OK** — modelo comercial sem campos internos de custo/margem/hora
- agendaOsLinks: **OK** — agenda=ag_muwozzjg_gktfo; os=os_muwozzjf_m2i1q; job=1; budget=orc_muwozzj2_pj9wd
- checklistPersistence: **OK** — item Entrada persistido e etapa atual=desmontagem
- deliveryFinancialIdempotence: **OK** — primeira sincronização +1; segunda +0; receitas OS=1
- accountPaymentReversal: **OK** — conta=ct_muwozzjk_b491r; tx=tx_muwozzjk_nr9xcc; vínculo preservado após pagar/desfazer
- historyArchiveTrashRestore: **OK** — vínculos antes=4; na lixeira=4; budgetId preservado=orc_muwozzj2_pj9wd
- operationalHistory: **OK** — eventos=20
- exportReimportFinancialSignatures: **OK** — assinaturas Financeiro/Contas idênticas
- exportReimportCriticalStores: **OK** — hashes críticos idênticos
- noDuplicateIdsAfterRoundTrip: **OK** — duplicados=0
- serviceReloadFromExport: **OK** — budget=true; os=true; agenda=true; receitaOS=1; checklistEntrada=true

## Escopo

Cliente → Orçamento → Agenda → OS → Checklist → Entrega → Financeiro + Contas + Histórico/Lixeira + export/reimport

## Limite desta evidência

Esta execução usa repositories em memória e services reais do OficinaOS. Ela valida regras de negócio, vínculos e round-trip, mas **não** comprova IndexedDB/reload em navegador, impressão/PDF real nem o build Vite.

## Contagens do cenário sintético

```json
{
  "before": {
    "transactions": 2,
    "accounts": 1,
    "clients": 1,
    "jobs": 1,
    "workOrders": 1,
    "appointments": 1,
    "checklists": 1,
    "budgets": 1,
    "categories": 0,
    "goals": 0,
    "stock": 0,
    "operationalHistory": 20,
    "budgetHistory": 0,
    "archivedBudgets": 0,
    "trash": 0,
    "deletionBackups": 4,
    "deletionLog": 0,
    "recurringTemplates": 0
  },
  "afterRoundTrip": {
    "transactions": 2,
    "accounts": 1,
    "clients": 1,
    "jobs": 1,
    "workOrders": 1,
    "appointments": 1,
    "checklists": 1,
    "budgets": 1,
    "categories": 0,
    "goals": 0,
    "stock": 0,
    "operationalHistory": 20,
    "budgetHistory": 0,
    "archivedBudgets": 0,
    "trash": 0,
    "deletionBackups": 4,
    "deletionLog": 0,
    "recurringTemplates": 0
  }
}
```

