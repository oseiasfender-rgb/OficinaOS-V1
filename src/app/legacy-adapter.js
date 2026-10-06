// Camada temporária. Não deve receber novas regras de negócio.
export function installLegacyAdapter({ store, repositories, services, eventBus }) {
  const adapter = Object.freeze({
    version: '0.9.1-rc1',
    getState: () => store.getState(),
    repositories,
    services,
    on: eventBus.on,
    emit: eventBus.emit
  });
  Object.defineProperty(window, 'OficinaOSLegacy', {
    value: adapter,
    configurable: true,
    enumerable: false,
    writable: false
  });
}
