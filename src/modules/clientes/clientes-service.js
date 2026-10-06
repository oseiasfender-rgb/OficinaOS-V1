import { safeText } from '../../core/validators.js';

function clone(value) {
  return structuredClone(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numericId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function nextNumericId(records, start, nestedKey) {
  let max = start - 1;
  const scan = nestedKey
    ? records.flatMap(record => asArray(record?.[nestedKey]))
    : records;
  for (const record of scan) {
    const n = numericId(record?.id);
    if (n != null && n > max) max = n;
  }
  return max + 1;
}

export function matchesClientDescription(description, clientName) {
  if (!description || !clientName) return false;
  const parts = String(clientName).toLowerCase().split(/\s+/).filter(word => word.length > 2);
  const haystack = String(description).toLowerCase();
  return parts.some(part => haystack.includes(part));
}

function normalizeVehicle(input = {}, id) {
  return {
    ...clone(input),
    id,
    marca: safeText(input.marca ?? input.name, 120),
    cor: safeText(input.cor, 60),
    ano: safeText(input.ano, 12),
    placa: safeText(input.placa, 12).toUpperCase(),
    obs: safeText(input.obs, 500)
  };
}

function normalizeService(input = {}, id) {
  const amount = Number(input.valor ?? input.value ?? 0);
  return {
    ...clone(input),
    id,
    data: safeText(input.data ?? input.date ?? new Date().toISOString().slice(0, 10), 10),
    desc: safeText(input.desc ?? input.description, 500),
    veiculo: safeText(input.veiculo, 160),
    valor: Number.isFinite(amount) ? amount : 0,
    cat: safeText(input.cat ?? input.category ?? 'Outros', 120),
    obs: safeText(input.obs, 1000),
    status: safeText(input.status ?? 'Concluído', 40)
  };
}

export function createClientesService({ repositories, eventBus, store }) {
  const repo = repositories.clients;
  const txRepo = repositories.transactions;
  const settingsRepo = repositories.settings;
  const deletionBackupRepo = repositories.deletionBackups;

  async function syncStore() {
    if (!store?.patch) return;
    store.patch({ clients: await repo.list() });
  }

  async function changed(action, id) {
    await syncStore();
    eventBus?.emit?.('clientes:changed', { action, id });
  }

  async function listRaw() {
    return repo.list();
  }

  async function buildHistory(client) {
    const name = client.name ?? client.nome ?? '';
    const transactions = txRepo ? await txRepo.list() : [];
    const txHistory = transactions
      .filter(tx => (tx.type === 'rec' || tx.tipo === 'receita') && matchesClientDescription(tx.desc ?? tx.description, name))
      .map(tx => ({
        tipo: 'tx', data: tx.date ?? tx.data ?? '', desc: tx.desc ?? tx.description ?? '',
        valor: Number(tx.val ?? tx.valor ?? 0) || 0, cat: tx.cat ?? tx.category ?? tx.categoria ?? '',
        veiculo: '', status: tx.paid === 'Pago' || tx.status === 'Pago' ? 'Pago' : 'Pendente', id: tx.id
      }));
    const manual = asArray(client.servicos).map(service => ({
      tipo: 'manual', data: service.data ?? '', desc: service.desc ?? '', valor: Number(service.valor ?? 0) || 0,
      cat: service.cat ?? '', veiculo: service.veiculo ?? '', status: service.status ?? 'Concluído', id: service.id
    }));
    return [...txHistory, ...manual].sort((a, b) => String(b.data).localeCompare(String(a.data)));
  }

  function photoKey(clientId) { return `fp_fotos_${clientId}`; }

  async function readPhotos(clientId) {
    if (!settingsRepo) return { antes: [], depois: [] };
    const row = await settingsRepo.get(photoKey(clientId));
    const value = row?.value;
    return { antes: asArray(value?.antes), depois: asArray(value?.depois) };
  }

  async function getRequired(id) {
    const current = await repo.get(id);
    if (!current) throw new Error('Cliente não encontrado.');
    return current;
  }

  return Object.freeze({
    async list({ query = '' } = {}) {
      const q = safeText(query, 120).toLocaleLowerCase('pt-BR');
      const rows = (await listRaw()).sort((a, b) =>
        safeText(a.name ?? a.nome).localeCompare(safeText(b.name ?? b.nome), 'pt-BR')
      );
      if (!q) return rows;
      return rows.filter(client => {
        const name = safeText(client.name ?? client.nome).toLocaleLowerCase('pt-BR');
        const phone = safeText(client.fone ?? client.phone).toLocaleLowerCase('pt-BR');
        const vehicles = asArray(client.veiculos).some(vehicle =>
          [vehicle.marca, vehicle.placa, vehicle.cor, vehicle.ano]
            .some(value => safeText(value).toLocaleLowerCase('pt-BR').includes(q))
        );
        return name.includes(q) || phone.includes(q) || vehicles;
      });
    },

    async get(id) {
      return repo.get(id);
    },

    async create(input = {}) {
      const name = safeText(input.name ?? input.nome, 120);
      if (!name) throw new Error('Nome do cliente é obrigatório.');
      const rows = await listRaw();
      const id = input.id ?? nextNumericId(rows, 100);
      const now = new Date().toISOString();
      const vehicles = asArray(input.veiculos).map((vehicle, index) => {
        const vehicleId = vehicle.id ?? nextNumericId(rows, 1000, 'veiculos') + index;
        return normalizeVehicle(vehicle, vehicleId);
      });
      const services = asArray(input.servicos).map((service, index) => {
        const serviceId = service.id ?? nextNumericId(rows, 10000, 'servicos') + index;
        return normalizeService(service, serviceId);
      });
      const record = {
        ...clone(input),
        id,
        name,
        nome: name,
        fone: safeText(input.fone ?? input.phone, 60),
        email: safeText(input.email, 160),
        doc: safeText(input.doc, 40),
        obs: safeText(input.obs, 1500),
        criado: safeText(input.criado ?? new Date().toISOString().slice(0, 10), 10),
        veiculos: vehicles,
        servicos: services,
        createdAt: input.createdAt ?? now,
        updatedAt: now
      };
      await repo.put(record);
      await changed('create', record.id);
      return record;
    },

    async update(id, changes = {}) {
      const current = await getRequired(id);
      const name = safeText(changes.name ?? changes.nome ?? current.name ?? current.nome, 120);
      if (!name) throw new Error('Nome do cliente é obrigatório.');
      const next = {
        ...current,
        ...clone(changes),
        id: current.id,
        name,
        nome: name,
        fone: safeText(changes.fone ?? changes.phone ?? current.fone ?? current.phone, 60),
        email: safeText(changes.email ?? current.email, 160),
        doc: safeText(changes.doc ?? current.doc, 40),
        obs: safeText(changes.obs ?? current.obs, 1500),
        veiculos: asArray(changes.veiculos ?? current.veiculos),
        servicos: asArray(changes.servicos ?? current.servicos),
        updatedAt: new Date().toISOString()
      };
      await repo.put(next);
      await changed('update', next.id);
      return next;
    },

    async remove(id) {
      const current = await getRequired(id);
      if (deletionBackupRepo) {
        const at = new Date().toISOString();
        await deletionBackupRepo.put({
          id: `client_${String(current.id)}_${Date.now()}`, at, entityType: 'client',
          reason: 'client-delete', payload: clone(current)
        });
      }
      await repo.delete(id);
      await changed('delete', current.id);
      return current;
    },

    async addVehicle(clientId, input = {}) {
      const current = await getRequired(clientId);
      const brand = safeText(input.marca ?? input.name, 120);
      if (!brand) throw new Error('Marca / modelo do veículo é obrigatório.');
      const rows = await listRaw();
      const vehicle = normalizeVehicle({ ...input, marca: brand }, input.id ?? nextNumericId(rows, 1000, 'veiculos'));
      const next = { ...current, veiculos: [...asArray(current.veiculos), vehicle], updatedAt: new Date().toISOString() };
      await repo.put(next);
      await changed('vehicle:create', current.id);
      return vehicle;
    },

    async updatePrimaryVehicle(clientId, input = {}) {
      const current = await getRequired(clientId);
      const brand = safeText(input.marca ?? input.name, 120);
      const vehicles = asArray(current.veiculos).map(clone);
      if (!brand) return current;
      if (vehicles.length) {
        vehicles[0] = normalizeVehicle({ ...vehicles[0], ...input, marca: brand }, vehicles[0].id);
      } else {
        const rows = await listRaw();
        vehicles.push(normalizeVehicle({ ...input, marca: brand }, input.id ?? nextNumericId(rows, 1000, 'veiculos')));
      }
      const next = { ...current, veiculos: vehicles, updatedAt: new Date().toISOString() };
      await repo.put(next);
      await changed('vehicle:update-primary', current.id);
      return next;
    },

    async removeVehicle(clientId, vehicleId) {
      const current = await getRequired(clientId);
      const vehicles = asArray(current.veiculos).filter(vehicle => String(vehicle.id) !== String(vehicleId));
      const next = { ...current, veiculos: vehicles, updatedAt: new Date().toISOString() };
      await repo.put(next);
      await changed('vehicle:delete', current.id);
      return next;
    },

    async addService(clientId, input = {}) {
      const current = await getRequired(clientId);
      const description = safeText(input.desc ?? input.description, 500);
      if (!description) throw new Error('Descrição do serviço é obrigatória.');
      const rows = await listRaw();
      const service = normalizeService(
        { ...input, desc: description },
        input.id ?? nextNumericId(rows, 10000, 'servicos')
      );
      const next = { ...current, servicos: [service, ...asArray(current.servicos)], updatedAt: new Date().toISOString() };
      await repo.put(next);
      await changed('service:create', current.id);
      return service;
    },

    async history(clientId) {
      return buildHistory(await getRequired(clientId));
    },

    async summary(clientId) {
      const client = await getRequired(clientId);
      const history = await buildHistory(client);
      return {
        client, services: history,
        totalSpent: history.reduce((sum, item) => sum + (Number(item.valor) || 0), 0),
        vehicleCount: asArray(client.veiculos).length, serviceCount: history.length
      };
    },

    async getPhotos(clientId) {
      await getRequired(clientId);
      return readPhotos(clientId);
    },

    async addPhotos(clientId, type, photos = []) {
      await getRequired(clientId);
      if (!['antes', 'depois'].includes(type)) throw new Error('Tipo de foto inválido.');
      if (!settingsRepo) throw new Error('Repositório de configurações indisponível.');
      const current = await readPhotos(clientId);
      const normalized = asArray(photos).map(photo => ({
        src: safeText(photo.src, 8_000_000), nome: safeText(photo.nome, 180),
        data: safeText(photo.data ?? new Date().toISOString().slice(0, 10), 10)
      })).filter(photo => photo.src);
      current[type] = [...current[type], ...normalized];
      await settingsRepo.put({ id: photoKey(clientId), value: current, updatedAt: new Date().toISOString() });
      eventBus?.emit?.('clientes:changed', { action: 'photo:create', id: clientId });
      return current;
    },

    async removePhoto(clientId, type, index) {
      await getRequired(clientId);
      if (!['antes', 'depois'].includes(type)) throw new Error('Tipo de foto inválido.');
      if (!settingsRepo) throw new Error('Repositório de configurações indisponível.');
      const current = await readPhotos(clientId);
      current[type].splice(Number(index), 1);
      await settingsRepo.put({ id: photoKey(clientId), value: current, updatedAt: new Date().toISOString() });
      eventBus?.emit?.('clientes:changed', { action: 'photo:delete', id: clientId });
      return current;
    }
  });
}
