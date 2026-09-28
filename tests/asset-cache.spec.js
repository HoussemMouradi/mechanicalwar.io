const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { localRuntime } = require('./local-runtime');

const root = path.resolve(__dirname, '..');
const moduleNames = fs.readdirSync(path.join(root, 'src')).filter(name => name.endsWith('.js')).sort();

test.beforeEach(async ({ context }) => {
  await localRuntime(context);
  await context.route('**/*peerjs*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.Peer = undefined;' }));
});

for (const prefix of ['/', '/mechanicalwar.io/']) {
  test(`all local assets request the same release under ${prefix}`, async ({ page, context }) => {
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      const url = new URL(request.url());
      if (url.hostname === '127.0.0.1' && /\/(?:src\/[^/]+\.js|styles\.css)$/.test(url.pathname)) requests.push(url);
    });
    if (prefix !== '/') {
      // Simulate the GitHub Pages project prefix with the same shipped files.
      await context.route(`**${prefix}**`, route => {
        const pathname = new URL(route.request().url()).pathname;
        const relative = pathname.slice(prefix.length) || 'index.html';
        return route.fulfill({
          path: path.join(root, relative),
          contentType: relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : 'text/html',
        });
      });
    }
    await page.goto(prefix);
    await page.waitForFunction(() => !!window.mw?.menu);
    const style = requests.find(url => url.pathname.endsWith('/styles.css'));
    expect(style, 'the versioned stylesheet was requested').toBeTruthy();
    const release = style.searchParams.get('v');
    expect(release).toBeTruthy();
    const modules = requests.filter(url => url.pathname.includes('/src/'));
    expect([...new Set(modules.map(url => path.basename(url.pathname)))].sort()).toEqual(moduleNames);
    for (const url of requests) {
      expect(url.pathname.startsWith(prefix)).toBe(true);
      expect(url.searchParams.get('v'), url.href).toBe(release);
    }
    expect(errors).toEqual([]);
  });
}

for (const staleStyle of [false, true]) {
  test(`HUD icons stay small with ${staleStyle ? 'an old stylesheet' : 'the current stylesheet'}`, async ({ page }) => {
    if (staleStyle) {
      // Legacy CSS knows the HUD shell but has no equipment or SVG sizing rules.
      // This reproduces the cache mismatch without depending on git history.
      await page.route('**/styles.css*', route => route.fulfill({
        contentType: 'text/css',
        body: 'html,body{margin:0}.hide{display:none!important}#hud{position:fixed;inset:0;pointer-events:none}',
      }));
    }
    await page.goto('/');
    await page.waitForFunction(() => !!window.mw?.menu);
    const icons = await page.evaluate(() => {
      // Exercise the HTML/CSS boundary directly; no match or WebGL scene is needed.
      document.getElementById('hud').classList.remove('hide');
      return ['armorStat', 'helmetStat', 'boostStat', 'hpBox'].map(id => {
        const svg = document.querySelector(`#${id} svg`), rect = svg.getBoundingClientRect();
        return { id, width: rect.width, height: rect.height, intrinsicWidth: svg.getAttribute('width'), intrinsicHeight: svg.getAttribute('height') };
      });
    });
    for (const icon of icons) {
      const expected = icon.id === 'hpBox' ? 30 : 22;
      expect(icon.intrinsicWidth, icon.id).toBe(String(expected));
      expect(icon.intrinsicHeight, icon.id).toBe(String(expected));
      expect(icon.width, icon.id).toBe(expected);
      expect(icon.height, icon.id).toBe(expected);
    }
  });
}
