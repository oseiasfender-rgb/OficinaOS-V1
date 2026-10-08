const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const COLORS = ['#b8621a','#1d6fa4','#15803d','#7c3aed','#be185d','#0f766e','#c2410c','#1e40af'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function button(text, className = 'btn') {
  const node = el('button', className, text);
  node.type = 'button';
  return node;
}

function field(label, input) {
  const wrap = el('label', 'cli-field');
  wrap.append(el('span', 'cli-field-label', label), input);
  return wrap;
}

function input(type = 'text', placeholder = '') {
  const node = el('input', 'cli-input');
  node.type = type;
  node.placeholder = placeholder;
  return node;
}

function textarea(placeholder = '') {
  const node = el('textarea', 'cli-input cli-textarea');
  node.placeholder = placeholder;
  node.rows = 3;
  return node;
}

function initials(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join('') || '?';
}

function colorFor(id) {
  const n = Number(id);
  const index = Number.isFinite(n) ? Math.abs(n) % COLORS.length : String(id).length % COLORS.length;
  return COLORS[index];
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  if (!year || !month || !day) return String(value);
  return `${day}/${month}/${year}`;
}

function shortDateParts(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-');
  const monthIndex = Number(month) - 1;
  return { day: day || '?', month: MONTHS[monthIndex] || '', year: year || '' };
}

function safeImageSource(value) {
  const src = String(value || '');
  return /^data:image\/(?:png|jpe?g|webp|gif|bmp);base64,/i.test(src) ? src : '';
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler a imagem.'));
    reader.readAsDataURL(file);
  });
}

export function renderClientesView(root, { service, onChanged }) {
  root.replaceChildren();

  const state = {
    selectedId: null,
    query: '',
    activeTab: 'historico',
    editingId: null,
    clients: []
  };

  const shell = el('section', 'clientes-module');
  const toolbar = el('div', 'clientes-toolbar');
  const titleWrap = el('div');
  titleWrap.append(el('h1', 'clientes-title', 'Clientes'), el('p', 'clientes-subtitle', 'Cadastro, veículos, serviços e histórico sem arrays globais.'));
  const toolbarActions = el('div', 'clientes-toolbar-actions');
  const search = input('search', 'Buscar nome, placa, veículo...');
  search.classList.add('cli-search');
  const newButton = button('＋ Novo cliente', 'btn btn-primary');
  toolbarActions.append(search, newButton);
  toolbar.append(titleWrap, toolbarActions);

  const feedback = el('div', 'cli-feedback');
  feedback.hidden = true;

  const body = el('div', 'cli-layout');
  const listPane = el('aside', 'cli-list-pane');
  const listCount = el('div', 'cli-list-count', '0 clientes');
  const list = el('div', 'cli-list-items');
  listPane.append(listCount, list);

  const detailPane = el('div', 'cli-detail-pane');
  const formPane = el('aside', 'cli-form-pane');
  formPane.hidden = true;
  body.append(listPane, detailPane, formPane);
  shell.append(toolbar, feedback, body);
  root.append(shell);

  function notify(message, tone = 'info') {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    feedback.hidden = false;
    window.setTimeout(() => {
      if (feedback.textContent === message) feedback.hidden = true;
    }, 3200);
  }

  async function call(action, successMessage) {
    try {
      const result = await action();
      if (successMessage) notify(successMessage, 'ok');
      await onChanged?.();
      return result;
    } catch (error) {
      console.error(error);
      notify(error?.message || 'Falha na operação.', 'error');
      return null;
    }
  }

  async function loadList() {
    state.clients = await service.list({ query: state.query });
    renderList();
  }

  function renderList() {
    list.replaceChildren();
    listCount.textContent = `${state.clients.length} ${state.clients.length === 1 ? 'cliente' : 'clientes'}`;
    if (!state.clients.length) {
      const empty = el('div', 'cli-empty');
      empty.append(el('strong', '', 'Nenhum cliente encontrado.'), el('span', '', state.query ? 'Altere a busca ou cadastre um novo cliente.' : 'Cadastre o primeiro cliente quando houver dados reais.'));
      const add = button('＋ Cadastrar', 'btn btn-primary btn-small');
      add.addEventListener('click', () => openForm());
      empty.append(add);
      list.append(empty);
      return;
    }

    for (const client of state.clients) {
      const card = el('button', `cli-card${String(state.selectedId) === String(client.id) ? ' active' : ''}`);
      card.type = 'button';
      const avatar = el('span', 'cli-mini-avatar', initials(client.name ?? client.nome));
      avatar.style.background = colorFor(client.id);
      const info = el('span', 'cli-card-info');
      const name = el('strong', 'cli-card-name', client.name ?? client.nome ?? 'Cliente');
      const vehicle = Array.isArray(client.veiculos) ? client.veiculos[0] : null;
      const sub = el('span', 'cli-card-sub', vehicle ? `${vehicle.marca || 'Veículo'}${vehicle.placa ? ` · ${vehicle.placa}` : ''}` : (client.fone || 'Sem veículo'));
      info.append(name, sub);
      card.append(avatar, info);
      card.addEventListener('click', async () => {
        state.selectedId = client.id;
        state.activeTab = 'historico';
        await renderSelected();
        renderList();
      });
      list.append(card);
    }
  }

  function renderEmptyDetail() {
    detailPane.replaceChildren();
    const empty = el('div', 'cli-detail-empty');
    empty.append(el('div', 'cli-detail-empty-icon', '👥'), el('strong', '', 'Selecione um cliente'), el('span', '', 'ou use “Novo cliente” para cadastrar.'));
    detailPane.append(empty);
  }

  async function renderSelected() {
    if (state.selectedId == null) {
      renderEmptyDetail();
      return;
    }
    const summary = await service.summary(state.selectedId).catch(() => null);
    if (!summary) {
      state.selectedId = null;
      renderEmptyDetail();
      return;
    }
    const client = summary.client;
    detailPane.replaceChildren();

    const header = el('div', 'cli-detail-header');
    header.style.background = `linear-gradient(135deg, ${colorFor(client.id)}, ${colorFor(client.id)}dd)`;
    const top = el('div', 'cli-detail-top');
    const avatar = el('div', 'cli-avatar', initials(client.name ?? client.nome));
    const identity = el('div', 'cli-identity');
    identity.append(el('h2', '', client.name ?? client.nome ?? 'Cliente'));
    if (client.fone) identity.append(el('span', '', `📱 ${client.fone}`));
    if (client.email) identity.append(el('span', '', `✉ ${client.email}`));
    const actions = el('div', 'cli-detail-actions');
    const edit = button('✎ Editar', 'btn btn-light btn-small');
    const remove = button('🗑 Excluir', 'btn btn-danger btn-small');
    edit.addEventListener('click', () => openForm(client));
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Excluir o cliente ${client.name ?? client.nome}?\n\nSerá criado um backup preventivo do cadastro antes da exclusão.`)) return;
      const deleted = await call(() => service.remove(client.id), 'Cliente excluído com backup preventivo.');
      if (!deleted) return;
      state.selectedId = null;
      await loadList();
      renderEmptyDetail();
    });
    actions.append(edit, remove);
    top.append(avatar, identity, actions);

    const stats = el('div', 'cli-stats cli-stats-header');
    const statData = [
      [BRL.format(summary.totalSpent), 'Total registrado'],
      [String(summary.vehicleCount), 'Veículos'],
      [String(summary.serviceCount), 'Serviços'],
      [formatDate(client.criado ?? client.createdAt), 'Cliente desde']
    ];
    for (const [value, label] of statData) {
      const stat = el('div', 'cli-stat');
      stat.append(el('strong', 'cli-stat-val', value), el('span', 'cli-stat-label', label));
      stats.append(stat);
    }
    header.append(top, stats);

    const detailBody = el('div', 'cli-detail-body');
    const tabs = el('div', 'cli-tabs');
    const tabDefs = [
      ['historico', `📋 Histórico (${summary.services.length})`],
      ['veiculos', `🚗 Veículos (${summary.vehicleCount})`],
      ['fotos', '📷 Fotos'],
      ['novoSvc', '+ Serviço']
    ];
    for (const [id, label] of tabDefs) {
      const tab = button(label, `cli-tab${state.activeTab === id ? ' active' : ''}`);
      tab.addEventListener('click', async () => {
        state.activeTab = id;
        await renderSelected();
      });
      tabs.append(tab);
    }
    detailBody.append(tabs);

    if (state.activeTab === 'historico') renderHistory(detailBody, summary.services);
    if (state.activeTab === 'veiculos') renderVehicles(detailBody, client);
    if (state.activeTab === 'novoSvc') renderServiceForm(detailBody, client);
    if (state.activeTab === 'fotos') await renderPhotos(detailBody, client);

    detailPane.append(header, detailBody);
  }

  function renderHistory(container, services) {
    const pane = el('div', 'cli-tab-pane active');
    pane.append(el('p', 'cli-empty', 'Receitas com cliente vinculado usam esse cadastro. Receitas antigas são associadas por nome somente quando correspondem a um único cliente; correspondências ambíguas não entram no total.'));
    if (!services.length) {
      pane.append(el('div', 'cli-empty', 'Nenhum serviço registrado ainda.'));
      container.append(pane);
      return;
    }
    for (const serviceItem of services) {
      const parts = shortDateParts(serviceItem.data);
      const card = el('article', 'hist-card');
      const date = el('div', 'hist-date-col');
      date.append(el('strong', 'hist-day', parts.day), el('span', 'hist-monyear', `${parts.month} ${parts.year}`));
      const info = el('div');
      info.append(el('strong', 'hist-svc-name', serviceItem.desc || 'Serviço'), el('span', 'hist-svc-sub', serviceItem.cat || 'Sem categoria'));
      if (serviceItem.veiculo) info.append(el('span', 'hist-svc-veiculo', `🚗 ${serviceItem.veiculo}`));
      info.append(el('span', `hist-status ${serviceItem.status === 'Pago' || serviceItem.status === 'Concluído' ? 'ok' : 'pending'}`, serviceItem.status || '—'));
      const value = el('strong', 'hist-val rec', BRL.format(Number(serviceItem.valor) || 0));
      card.append(date, info, value);
      pane.append(card);
    }
    container.append(pane);
  }

  function renderVehicles(container, client) {
    const pane = el('div', 'cli-tab-pane active');
    const vehicles = Array.isArray(client.veiculos) ? client.veiculos : [];
    if (!vehicles.length) pane.append(el('div', 'cli-empty', 'Nenhum veículo cadastrado.'));
    for (const vehicle of vehicles) {
      const card = el('article', 'veiculo-card');
      const row = el('div', 'veiculo-card-header');
      row.append(el('strong', 'veiculo-nome', `🚗 ${vehicle.marca || 'Veículo'}${vehicle.cor ? ` · ${vehicle.cor}` : ''}`));
      if (vehicle.placa) row.append(el('span', 'veiculo-placa', vehicle.placa));
      const meta = [vehicle.ano ? `Ano ${vehicle.ano}` : '', vehicle.obs || ''].filter(Boolean).join(' · ');
      const remove = button('✕ Remover', 'btn btn-danger btn-small');
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Remover o veículo ${vehicle.marca || ''}${vehicle.placa ? ` (${vehicle.placa})` : ''}?`)) return;
        const result = await call(() => service.removeVehicle(client.id, vehicle.id), 'Veículo removido.');
        if (result) await renderSelected();
      });
      card.append(row);
      if (meta) card.append(el('div', 'veiculo-meta', meta));
      card.append(remove);
      pane.append(card);
    }

    const addCard = el('form', 'cli-inline-form');
    const heading = el('strong', 'cli-inline-title', '+ Adicionar veículo');
    const marca = input('text', 'Marca e modelo *');
    const cor = input('text', 'Cor');
    const ano = input('text', 'Ano');
    const placa = input('text', 'Placa');
    const obs = input('text', 'Observações');
    const grid = el('div', 'cli-form-grid');
    grid.append(marca, cor, ano, placa);
    const submit = button('🚗 Adicionar', 'btn btn-secondary');
    submit.type = 'submit';
    addCard.append(heading, grid, obs, submit);
    addCard.addEventListener('submit', async event => {
      event.preventDefault();
      const result = await call(() => service.addVehicle(client.id, { marca: marca.value, cor: cor.value, ano: ano.value, placa: placa.value, obs: obs.value }), 'Veículo adicionado.');
      if (result) await renderSelected();
    });
    pane.append(addCard);
    container.append(pane);
  }

  function renderServiceForm(container, client) {
    const pane = el('div', 'cli-tab-pane active');
    const form = el('form', 'cli-inline-form');
    form.append(el('strong', 'cli-inline-title', 'Registrar serviço realizado'));
    const date = input('date');
    date.value = new Date().toISOString().slice(0, 10);
    const value = input('number', 'Valor R$');
    value.min = '0';
    value.step = '0.01';
    const desc = input('text', 'Descrição do serviço *');
    const vehicle = el('select', 'cli-input');
    vehicle.append(new Option('Veículo (opcional)', ''));
    for (const item of Array.isArray(client.veiculos) ? client.veiculos : []) {
      vehicle.append(new Option(`${item.marca || 'Veículo'}${item.placa ? ` (${item.placa})` : ''}`, item.marca || ''));
    }
    const category = el('select', 'cli-input');
    for (const name of ['Funilaria','Chaparia / Amassados','Pintura Completa','Pintura de Peças','Retoques de Pintura','Polimento','Soldas','Serviços Rápidos','Troca de Peças','Venda de Peças','Metal Finish','Outros']) {
      category.append(new Option(name, name));
    }
    const obs = textarea('Observações (opcional)');
    const grid = el('div', 'cli-form-grid');
    grid.append(date, value);
    const submit = button('✓ Registrar serviço', 'btn btn-primary');
    submit.type = 'submit';
    form.append(grid, desc, vehicle, category, obs, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const result = await call(() => service.addService(client.id, {
        data: date.value, valor: Number(value.value || 0), desc: desc.value,
        veiculo: vehicle.value, cat: category.value, obs: obs.value, status: 'Concluído'
      }), 'Serviço registrado.');
      if (result) {
        state.activeTab = 'historico';
        await renderSelected();
      }
    });
    pane.append(form);
    container.append(pane);
  }

  async function renderPhotos(container, client) {
    const pane = el('div', 'cli-tab-pane active');
    const photos = await service.getPhotos(client.id);
    const grid = el('div', 'photo-columns');
    for (const type of ['antes', 'depois']) {
      const column = el('section', 'photo-column');
      column.append(el('strong', `photo-title ${type}`, type === 'antes' ? '📷 ANTES do serviço' : '📷 DEPOIS do serviço'));
      const picker = input('file');
      picker.accept = 'image/*';
      picker.multiple = true;
      picker.classList.add('photo-picker');
      const pickLabel = el('label', 'photo-upload', 'Clique para adicionar fotos');
      pickLabel.append(picker);
      column.append(pickLabel);
      const photoGrid = el('div', 'photo-grid');
      for (const [index, photo] of photos[type].entries()) {
        const src = safeImageSource(photo.src);
        if (!src) continue;
        const card = el('figure', 'photo-card');
        const image = document.createElement('img');
        image.src = src;
        image.alt = photo.nome || `Foto ${type}`;
        image.loading = 'lazy';
        const caption = el('figcaption', '', photo.nome || formatDate(photo.data));
        const remove = button('✕', 'photo-remove');
        remove.setAttribute('aria-label', 'Remover foto');
        remove.addEventListener('click', async () => {
          if (!window.confirm('Remover esta foto?')) return;
          const result = await call(() => service.removePhoto(client.id, type, index), 'Foto removida.');
          if (result) await renderSelected();
        });
        card.append(image, caption, remove);
        photoGrid.append(card);
      }
      if (!photoGrid.children.length) photoGrid.append(el('div', 'cli-empty', 'Nenhuma foto registrada.'));
      column.append(photoGrid);
      picker.addEventListener('change', async () => {
        const files = [...(picker.files || [])].filter(file => file.type.startsWith('image/'));
        if (!files.length) return;
        try {
          const payload = [];
          for (const file of files) payload.push({ src: await fileToDataUrl(file), nome: file.name, data: new Date().toISOString().slice(0, 10) });
          const result = await call(() => service.addPhotos(client.id, type, payload), `${payload.length} foto(s) adicionada(s).`);
          if (result) await renderSelected();
        } catch (error) {
          notify(error?.message || 'Falha ao ler as fotos.', 'error');
        }
      });
      grid.append(column);
    }
    pane.append(grid);
    container.append(pane);
  }

  function closeForm() {
    state.editingId = null;
    formPane.hidden = true;
    body.classList.remove('with-form');
    formPane.replaceChildren();
  }

  function openForm(client = null) {
    state.editingId = client?.id ?? null;
    formPane.hidden = false;
    body.classList.add('with-form');
    formPane.replaceChildren();

    const heading = el('div', 'cli-form-heading');
    heading.append(el('strong', '', client ? 'Editar cliente' : 'Novo cliente'));
    const close = button('✕', 'icon-button');
    close.setAttribute('aria-label', 'Fechar formulário');
    close.addEventListener('click', closeForm);
    heading.append(close);

    const form = el('form', 'cli-client-form');
    const name = input('text', 'Nome do cliente');
    name.required = true;
    const phone = input('tel', '(19) 99999-9999');
    const email = input('email', 'email@exemplo.com');
    const doc = input('text', 'CPF / CNPJ');
    const obs = textarea('Notas sobre o cliente');
    const vehicleTitle = el('strong', 'cli-form-section-title', '🚗 Veículo principal');
    const vehicleGrid = el('div', 'cli-form-grid');
    const marca = input('text', 'Marca / Modelo');
    const ano = input('text', 'Ano');
    const placa = input('text', 'Placa');
    const cor = input('text', 'Cor');
    vehicleGrid.append(marca, ano, placa, cor);

    if (client) {
      name.value = client.name ?? client.nome ?? '';
      phone.value = client.fone ?? '';
      email.value = client.email ?? '';
      doc.value = client.doc ?? '';
      obs.value = client.obs ?? '';
      const vehicle = Array.isArray(client.veiculos) ? client.veiculos[0] : null;
      if (vehicle) {
        marca.value = vehicle.marca ?? '';
        ano.value = vehicle.ano ?? '';
        placa.value = vehicle.placa ?? '';
        cor.value = vehicle.cor ?? '';
      }
    }

    const save = button(client ? '💾 Atualizar cliente' : '💾 Salvar cliente', 'btn btn-primary cli-save');
    save.type = 'submit';
    form.append(field('Nome completo *', name), field('Telefone / WhatsApp', phone), field('E-mail', email), field('CPF / CNPJ', doc), vehicleTitle, vehicleGrid, field('Observações', obs), save);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const base = { nome: name.value, fone: phone.value, email: email.value, doc: doc.value, obs: obs.value };
      let result;
      if (client) {
        result = await call(async () => {
          const updated = await service.update(client.id, base);
          if (marca.value.trim()) await service.updatePrimaryVehicle(client.id, { marca: marca.value, ano: ano.value, placa: placa.value, cor: cor.value });
          return updated;
        }, 'Cliente atualizado.');
      } else {
        const payload = { ...base, veiculos: marca.value.trim() ? [{ marca: marca.value, ano: ano.value, placa: placa.value, cor: cor.value, obs: '' }] : [] };
        result = await call(() => service.create(payload), 'Cliente cadastrado.');
      }
      if (!result) return;
      state.selectedId = result.id;
      closeForm();
      await loadList();
      await renderSelected();
    });

    formPane.append(heading, form);
    window.setTimeout(() => name.focus(), 0);
  }

  search.addEventListener('input', async () => {
    state.query = search.value;
    await loadList();
  });
  newButton.addEventListener('click', () => openForm());

  renderEmptyDetail();
  loadList().catch(error => notify(error.message, 'error'));

  return Object.freeze({
    async refresh() {
      await loadList();
      if (state.selectedId != null) await renderSelected();
    }
  });
}
