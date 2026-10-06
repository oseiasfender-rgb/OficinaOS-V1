import { createRelatoriosService } from './relatorios/relatorios-service.js';
import { createConsultorService } from './consultor/consultor-service.js';

export function createAnalyticsServices(ctx){
  const relatorios=createRelatoriosService({...ctx,metasService:ctx.metasService});
  const consultor=createConsultorService({...ctx,relatoriosService:relatorios});
  return Object.freeze({relatorios,consultor});
}
