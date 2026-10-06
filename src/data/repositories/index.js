import { STORES } from '../schema.js';
import { createBaseRepository } from './base-repository.js';

export function createRepositories(db) {
  const repositories = {};
  for (const name of STORES) repositories[name] = createBaseRepository(db, name);
  return Object.freeze(repositories);
}
