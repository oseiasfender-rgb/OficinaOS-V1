import { createClientesService } from './clientes/clientes-service.js';
import { createCategoriasService } from './categorias/categorias-service.js';
import { createEstoqueService } from './estoque/estoque-service.js';
import { createMetasService } from './metas/metas-service.js';
import { createConfiguracoesService } from './configuracoes/configuracoes-service.js';

export function createSimpleModuleServices(context) {
  return Object.freeze({
    clientes: createClientesService(context),
    categorias: createCategoriasService(context),
    estoque: createEstoqueService(context),
    metas: createMetasService(context),
    configuracoes: createConfiguracoesService(context)
  });
}
