import { renderClientesView } from '../modules/clientes/clientes-view.js';
import { renderCategoriasView } from '../modules/categorias/categorias-view.js';
import { renderEstoqueView } from '../modules/estoque/estoque-view.js';
import { renderMetasView } from '../modules/metas/metas-view.js';
import { renderConfiguracoesView } from '../modules/configuracoes/configuracoes-view.js';
import { renderAgendaView } from '../modules/agenda/agenda-view.js';
import { renderOrdemServicoView } from '../modules/ordem-servico/ordem-servico-view.js';
import { renderOrcamentoView } from '../modules/orcamento/orcamento-view.js';
import { renderFinanceiroView } from '../modules/financeiro/financeiro-view.js';
import { renderContasView } from '../modules/contas/contas-view.js';
import { renderHistoricosView } from '../modules/historico-orcamentos/historicos-view.js';
import { renderRelatoriosView } from '../modules/relatorios/relatorios-view.js';
import { renderConsultorView } from '../modules/consultor/consultor-view.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function metric(label, value) {
  const card = el('article', 'metric');
  card.append(el('span', 'metric-label', label), el('strong', 'metric-value', String(value)));
  return card;
}

export function renderAppShell(root, api) {
  root.replaceChildren();

  const header = el('header', 'topbar');
  const brandWrap = el('div', 'brand-wrap');
  brandWrap.append(el('strong', 'brand', 'OficinaOS'), el('span', 'badge', 'homologação modular v0.9.1 RC1'));
  const nav = el('nav', 'app-nav');
  const navItems = [
    ['overview','Migração'], ['budget','Orçamento'], ['finance','Financeiro'], ['accounts','Contas'], ['clients','Clientes'], ['categories','Categorias'],
    ['stock','Estoque'], ['goals','Metas'], ['settings','Configurações'], ['agenda','Agenda'], ['workOrders','OS'], ['history','Históricos'], ['reports','Relatórios'], ['consultant','Consultor IA']
  ];
  const navButtons = new Map();
  for (const [id, label] of navItems) {
    const b = el('button', `nav-btn${id==='overview'?' active':''}`, label); b.type='button'; navButtons.set(id,b); nav.append(b);
  }
  header.append(brandWrap, nav);

  const host = el('div', 'view-host');
  const overview = el('main', 'shell');
  const moduleHosts = new Map();
  for (const [id] of navItems.slice(1)) { const h=el('div'); h.hidden=true; moduleHosts.set(id,h); host.append(h); }

  const intro = el('section', 'card');
  intro.append(
    el('h1', '', 'Migração controlada a partir do Clean v8'),
    el('p', '', 'A baseline continua intacta. A Fase 9 migra Relatórios e Consultor IA para os repositories estabilizados, mantendo o consultor em modo somente leitura e integrações externas sem segredo no frontend.')
  );

  const status = el('section', 'card');
  status.append(el('h2', '', 'Estado da migração'));
  const statusText = el('p', 'status-line', api.legacyAvailable ? 'Banco legado detectado neste domínio.' : 'Banco legado não detectado neste domínio. Use o backup JSON para migração entre ambientes.');
  status.append(statusText);

  const actions = el('div', 'actions');
  const importFile = el('button', 'btn btn-primary', 'Importar backup JSON');
  const importDb = el('button', 'btn', 'Importar IndexedDB legado');
  const exportBackup = el('button', 'btn', 'Exportar backup compatível');
  const audit = el('button', 'btn', 'Auditar dados');
  for (const button of [importFile, importDb, exportBackup, audit]) button.type = 'button';
  importDb.disabled = !api.legacyAvailable;
  actions.append(importFile, importDb, exportBackup, audit);
  status.append(actions);

  const metricsCard = el('section', 'card');
  metricsCard.append(el('h2', '', 'Contagens atuais'));
  const metrics = el('div', 'metrics');
  metricsCard.append(metrics);

  const phase = el('section', 'grid');
  const blocks = [
    ['Fase 1', 'Baseline preservada', 'Concluída'],
    ['Fase 2', 'Shell ES Modules / Vite', 'Concluída'],
    ['Fase 3', 'IndexedDB + compatibilidade legada', 'Concluída · compatibilidade com JSON oficial validada'],
    ['Fase 4', 'Clientes', 'Concluída · cadastro, veículos, serviços, histórico e fotos validados'],
    ['Fase 4', 'Categorias, Estoque, Metas e Configurações', 'Concluída · categorias, estoque, metas e configurações validados'],
    ['Fase 5', 'Agenda → OS → Checklist', 'Concluída · fluxo integrado e persistência validados'],
    ['Fase 6', 'Orçamento e PDF comercial', 'Concluída · cálculos validados; PDF/PNG e WhatsApp confirmados pelo usuário'],
    ['Fase 7', 'Financeiro e Contas', 'Concluída · testes aprovados e recuperação do financeiro confirmada pelo usuário'],
    ['Fase 8', 'Históricos, Arquivados e Lixeira', 'Concluída no escopo testado · arquivo e lixeira validados; recuperação após exclusão definitiva pendente'],
    ['Fase 9', 'Relatórios e Consultor IA', 'Concluída no escopo local · relatórios e consultor por regras validados; provedor de IA externo pendente']
  ];
  for (const [title, description, state] of blocks) {
    const card = el('article', 'card');
    card.append(el('h2', '', title), el('p', '', description), el('span', 'phase-state', state));
    phase.append(card);
  }

  const closure = el('section', 'card');
  closure.append(el('h2', '', 'Encerramento da homologação'),
    el('p', '', '10/10/2026: instalação no Desktop e Android, funcionamento sem conexão e exportação/compartilhamento de PDF e PNG confirmados pelo usuário. Recuperação do financeiro e estoque zerado também conferidos pelo usuário.'),
    el('p', '', 'Pendências: recuperação pela cópia preventiva após exclusão definitiva; testes de interrupção durante gravação e uso em múltiplas abas. Integração com provedor real de IA é opcional e ainda não foi homologada.'));
  overview.append(intro, status, metricsCard, phase, closure);
  host.prepend(overview);
  root.append(header, host);

  function renderMetrics(counts) {
    metrics.replaceChildren();
    const labels = {
      transactions:'Transações', accounts:'Contas', clients:'Clientes', jobs:'Jobs legado',
      workOrders:'OS', appointments:'Agenda', checklists:'Checklists', budgets:'Orçamentos', stock:'Estoque', goals:'Metas', categories:'Categorias',
      archivedBudgets:'Arquivados', trash:'Lixeira', operationalHistory:'Histórico operacional'
    };
    for (const [key, label] of Object.entries(labels)) metrics.append(metric(label, counts[key] || 0));
  }
  renderMetrics(api.audit().counts);

  const views = new Map();
  async function refresh(message) {
    renderMetrics(api.audit().counts);
    if (message) statusText.textContent = message;
    for (const [name, view] of views) if (!moduleHosts.get(name)?.hidden && view?.refresh) await view.refresh();
  }

  async function showView(name) {
    overview.hidden = name !== 'overview';
    for (const [id, h] of moduleHosts) h.hidden = id !== name;
    for (const [id, b] of navButtons) b.classList.toggle('active', id === name);
    if (name === 'overview') return;
    if (!views.has(name)) {
      const common = { onChanged: () => refresh() };
      let view;
      if (name === 'budget') view = renderOrcamentoView(moduleHosts.get(name), { service: api.budget, ...common });
      if (name === 'finance') view = renderFinanceiroView(moduleHosts.get(name), { service: api.finance, ...common });
      if (name === 'accounts') view = renderContasView(moduleHosts.get(name), { service: api.accounts, ...common });
      if (name === 'clients') view = renderClientesView(moduleHosts.get(name), { service: api.clients, ...common });
      if (name === 'categories') view = renderCategoriasView(moduleHosts.get(name), { service: api.categories, ...common });
      if (name === 'stock') view = renderEstoqueView(moduleHosts.get(name), { service: api.stock, ...common });
      if (name === 'goals') view = renderMetasView(moduleHosts.get(name), { service: api.goals, categoriesService: api.categories, ...common });
      if (name === 'settings') view = renderConfiguracoesView(moduleHosts.get(name), { service: api.settings, ...common });
      if (name === 'agenda') view = renderAgendaView(moduleHosts.get(name), { service: api.agenda, ...common });
      if (name === 'workOrders') view = renderOrdemServicoView(moduleHosts.get(name), { service: api.workOrders, checklists: api.checklists, ...common });
      if (name === 'history') view = renderHistoricosView(moduleHosts.get(name), { operational: api.operationalHistory, budgets: api.budgetHistory, ...common });
      if (name === 'reports') view = renderRelatoriosView(moduleHosts.get(name), { service: api.reports, ...common });
      if (name === 'consultant') view = renderConsultorView(moduleHosts.get(name), { service: api.consultant });
      views.set(name, view);
    } else if (views.get(name)?.refresh) await views.get(name).refresh();
  }

  for (const [id, button] of navButtons) button.addEventListener('click', () => showView(id));

  importFile.addEventListener('click', async () => { const result = await api.importJsonFile(); await refresh(result.message); });
  importDb.addEventListener('click', async () => { const result = await api.importLegacyDatabase(); await refresh(result.message); });
  exportBackup.addEventListener('click', async () => { const result = await api.exportBackup(); await refresh(result.message); });
  audit.addEventListener('click', async () => {
    const report = api.audit();
    await refresh(report.valid ? `Auditoria OK: ${report.duplicateCount} IDs duplicados.` : `Auditoria encontrou ${report.duplicateCount} IDs duplicados.`);
  });
}
