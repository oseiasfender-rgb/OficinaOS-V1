import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.OFICINAOS_BASE_URL || 'http://127.0.0.1:4173/';
const jsonPath = path.resolve(process.argv[2] || 'homologation/pwa-gate.json');
const mdPath = path.resolve(process.argv[3] || 'homologation/pwa-gate.md');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const result = {
  baseUrl,
  passed: false,
  gates: {},
  manifest: null
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  assert(manifestHref, 'Manifest não está vinculado ao HTML.');
  const manifestUrl = new URL(manifestHref, page.url()).href;
  const manifestResponse = await page.request.get(manifestUrl);
  assert(manifestResponse.ok(), `Manifest HTTP ${manifestResponse.status()}.`);
  const manifest = await manifestResponse.json();
  result.manifest = {
    name: manifest.name,
    start_url: manifest.start_url,
    scope: manifest.scope,
    display: manifest.display,
    icons: manifest.icons
  };

  assert(manifest.name === 'OficinaOS', 'Nome do manifest divergente.');
  assert(manifest.start_url === './', 'start_url deve ser relativo.');
  assert(manifest.scope === './', 'scope deve ser relativo.');
  assert(manifest.display === 'standalone', 'display deve ser standalone.');
  const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
  const icon192 = icons.find((icon) => icon.sizes === '192x192' && icon.type === 'image/png');
  const icon512 = icons.find((icon) => icon.sizes === '512x512' && icon.type === 'image/png');
  assert(icon192, 'Ícone PNG 192x192 ausente.');
  assert(icon512, 'Ícone PNG 512x512 ausente.');
  result.gates.manifest = true;

  for (const icon of [icon192, icon512]) {
    const iconUrl = new URL(icon.src, manifestUrl).href;
    const response = await page.request.get(iconUrl);
    assert(response.ok(), `Ícone indisponível: ${iconUrl}`);
    assert((response.headers()['content-type'] || '').includes('image/png'), `Content-Type inválido para ${iconUrl}`);
  }
  result.gates.icons = true;

  const registration = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return null;
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout service worker')), 10000))
    ]);
    return { scope: ready.scope, active: Boolean(ready.active) };
  });
  assert(registration?.active, 'Service worker não ficou ativo.');
  result.gates.serviceWorkerActive = true;

  await page.reload({ waitUntil: 'networkidle' });
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  assert(controlled, 'Página não ficou controlada pelo service worker após reload.');
  result.gates.serviceWorkerControlsPage = true;

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const offlineText = (await page.locator('#app').innerText()).trim();
  assert(offlineText.length > 0, 'App não carregou do cache em modo offline.');
  result.gates.offlineReload = true;
  await context.setOffline(false);

  result.passed = Object.values(result.gates).every(Boolean);
} finally {
  await context.setOffline(false).catch(() => {});
  await browser.close();
}

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
await fs.writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
const lines = [
  '# Homologação PWA',
  '',
  `- Base URL: ${result.baseUrl}`,
  `- Resultado: **${result.passed ? 'PASS' : 'FAIL'}**`,
  '',
  '## Gates',
  ...Object.entries(result.gates).map(([name, passed]) => `- ${passed ? '✅' : '❌'} ${name}`),
  ''
];
await fs.writeFile(mdPath, `${lines.join('\n')}\n`);

if (!result.passed) process.exitCode = 1;
