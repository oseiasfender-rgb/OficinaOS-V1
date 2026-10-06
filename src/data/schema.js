export const DB_NAME = 'oficinaos_modular';
export const DB_VERSION = 5;
export const DATA_SCHEMA = 'oficinaos-modular-v5';

export const STORE_DEFINITIONS = Object.freeze({
  transactions: { keyPath: 'id', indexes: [['date','date'], ['type','type'], ['paid','paid'], ['contaId','contaId'], ['source','source'], ['transferId','transferId'], ['workOrderId','workOrderId']] },
  accounts: { keyPath: 'id', indexes: [['due','due'], ['paid','paid'], ['category','category'], ['recurKey','recurKey'], ['competencia','competencia'], ['paidTxId','paidTxId'], ['fromTx','fromTx']] },
  clients: { keyPath: 'id', indexes: [['name','name']] },
  jobs: { keyPath: 'id', indexes: [['date','date'], ['status','status'], ['budgetId','budgetId']] },
  workOrders: { keyPath: 'id', indexes: [['clientId','clientId'], ['budgetId','budgetId'], ['status','status'], ['stage','stage'], ['legacyJobId','legacyJobId']] },
  appointments: { keyPath: 'id', indexes: [['workOrderId','workOrderId'], ['clientId','clientId'], ['date','date'], ['status','status']] },
  checklists: { keyPath: 'id', indexes: [['contextType','contextType'], ['contextId','contextId'], ['currentStage','currentStage']] },
  budgets: { keyPath: 'id', indexes: [['status','status'], ['date','date']] },
  categories: { keyPath: 'id', indexes: [['name','name'], ['group','group']] },
  goals: { keyPath: 'id', indexes: [['category','category']] },
  stock: { keyPath: 'id', indexes: [['name','name'], ['category','category']] },
  operationalHistory: { keyPath: 'id', indexes: [['at','at'], ['module','module']] },
  budgetHistory: { keyPath: 'id', indexes: [['date','date'], ['status','status']] },
  archivedBudgets: { keyPath: 'id', indexes: [['archivedAt','archivedAt']] },
  trash: { keyPath: 'id', indexes: [['deletedAt','deletedAt'], ['entityType','entityType']] },
  deletionBackups: { keyPath: 'id', indexes: [['at','at']] },
  deletionLog: { keyPath: 'id', indexes: [['at','at']] },
  recurringTemplates: { keyPath: 'id', indexes: [['active','active']] },
  backups: { keyPath: 'id', indexes: [['createdAt','createdAt']] },
  meta: { keyPath: 'id' },
  settings: { keyPath: 'id' }
});

export const STORES = Object.freeze(Object.keys(STORE_DEFINITIONS));

export const STATE_STORES = Object.freeze([
  'transactions','accounts','clients','jobs','workOrders','appointments','checklists','budgets','categories','goals','stock',
  'operationalHistory','budgetHistory','archivedBudgets','trash','deletionBackups',
  'deletionLog','recurringTemplates'
]);
