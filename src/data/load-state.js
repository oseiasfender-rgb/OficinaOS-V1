import { STATE_STORES } from './schema.js';

export async function loadStateFromRepositories(repositories) {
  const state = {};
  for (const name of STATE_STORES) state[name] = repositories[name] ? await repositories[name].list() : [];
  return state;
}

export async function databaseHasOperationalData(repositories) {
  for (const name of ['transactions','accounts','clients','jobs','budgets','stock','goals']) {
    if (repositories[name] && await repositories[name].count() > 0) return true;
  }
  return false;
}
