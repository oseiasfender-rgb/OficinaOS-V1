import './styles/tokens.css';
import './styles/layout.css';
import { boot } from './app/boot.js';

boot(document.getElementById('app'));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js', {
        scope: './',
        updateViaCache: 'none'
      });
    } catch (error) {
      console.warn('[OficinaOS] Falha ao registrar o service worker.', error);
    }
  });
}
