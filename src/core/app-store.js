const initialState = Object.freeze({
  transactions: [], accounts: [], clients: [], jobs: [], workOrders: [], appointments: [], checklists: [], budgets: [],
  categories: [], goals: [], stock: [], operationalHistory: [], budgetHistory: [],
  archivedBudgets: [], trash: [], deletionBackups: [], deletionLog: [], recurringTemplates: []
});

export function createStore(seed = {}) {
  let state = structuredClone({ ...initialState, ...seed });
  const subscribers = new Set();
  return Object.freeze({
    getState: () => structuredClone(state),
    replace(next) {
      state = structuredClone({ ...initialState, ...next });
      subscribers.forEach(fn => fn(structuredClone(state)));
    },
    patch(patch) {
      state = { ...state, ...structuredClone(patch) };
      subscribers.forEach(fn => fn(structuredClone(state)));
    },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); }
  });
}
