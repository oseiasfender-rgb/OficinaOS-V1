import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const baseURL = process.env.OFICINAOS_BASE_URL || 'http://127.0.0.1:4173/';
const jsonPath = process.argv[2] || 'homologation/PWA_READINESS.json';
const mdPath = process.argv[3] || 'homologation/PWA_READINESS.md';

const result = {
  baseURL,
  timestamp: new Date().toISOString(),
  checks: {},
  pass: false
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  const response = await page.goto(baseURL, { waitUntil: 'networkidle' });
  result.checks.http200 = response?.ok() === true;
  result.checks.appRendered = await page.locator('#app').evaluate((el) => el.textContent.trim().length > 0);

  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const res = await fetch(link.href);
    if (!res.ok) return null;
    return { url: link.href, body: await res.json() };
  });

  const icons = manifest?.body?.icons || [];
  result.checks.manifestPresent = Boolean(manifest);
  result.checks.icon192Declared = icons.some((icon) => icon.sizes === '192x192' && icon.type === 'image/png');
  result.checks.icon512Declared = icons.some((icon) => icon.sizes === '512x512' && icon.type === 'image/png');
  result.checks.displayStandalone = manifest?.body?.display === 'standalone';

  result.checks.iconResponses = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const manifestBody = await (await fetch(link.href)).json();
    return Promise.all((manifestBody.icons || []).map(async (icon) => {
      const url = new URL(icon.src, link.href).href;
      const res = await fetch(url);
      return { sizes: icon.sizes, ok: res.ok, type: res.headers.get('content-type') || '' };
    }));
  });
  result.checks.iconsFetchOk = result.checks.iconResponses.every((icon) => icon.ok && icon.type.includes('image/png'));

  await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker não suportado pelo navegador de teste.');
    await navigator.serviceWorker.ready;
  });

  const sw = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      scope: registration.scope,
      active: Boolean(registration.active),
      controlled: Boolean(navigator.serviceWorker.controller)
    };
  });

  result.checks.serviceWorkerActive = sw.active;
  result.checks.serviceWorkerScope = sw.scope;
  result.checks.scopeMatchesBase = sw.scope === new URL('./', baseURL).href;

  let controlled = sw.controlled;
  if (!controlled) {
    await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 15000 });
    controlled = true;
  }
  result.checks.serviceWorkerControlsPage = controlled;

  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  result.checks.offlineReload = await page.locator('#app').evaluate((el) => el.textContent.trim().length > 0);
  await context.setOffline(false);

  result.pass = Object.entries(result.checks)
    .filter(([key]) => !['iconResponses', 'serviceWorkerScope'].includes(key))
    .every(([, value]) => value === true);
} catch (error) {
  result.error = String(error?.stack || error);
} finally {
  try { await context.setOffline(false); } catch {}
  await browser.close();
}

await writeFile(jsonPath, JSON.stringify(result, null, 2) + '\n');
const lines = [
  '# OficinaOS — PWA Production Readiness',
  '',
  `- Base URL: ${result.baseURL}`,
  `- Resultado: **${result.pass ? 'PASS' : 'FAIL'}**`,
  '',
  '## Checks',
  ''
];
for (const [key, value] of Object.entries(result.checks)) {
  if (key === 'iconResponses') continue;
  lines.push(`- ${key}: ${typeof value === 'boolean' ? (value ? 'PASS' : 'FAIL') : String(value)}`);
}
if (result.error) lines.push('', '## Erro', '', '```', result.error, '```');
await writeFile(mdPath, lines.join('\n') + '\n');
console.log(JSON.stringify(result, null, 2));

if (!result.pass) process.exit(1);
