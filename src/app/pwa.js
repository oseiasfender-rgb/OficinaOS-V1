export function registerPwa() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' }).catch((error) => {
      console.warn('[OficinaOS] Falha ao registrar service worker.', error);
    });
  }, { once: true });
}
