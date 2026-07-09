const { test, expect } = require('@playwright/test');

const peerMock = `
  window.Peer = class {
    constructor(id) {
      this.id = id || 'test-peer';
      this.handlers = {};
      setTimeout(() => this.handlers.open && this.handlers.open(this.id), 20);
    }
    on(name, cb) { this.handlers[name] = cb; }
    connect() { return { open: true, on() {}, send() {}, close() {} }; }
    destroy() {}
  };
`;

test.beforeEach(async ({ page }) => {
  await page.route('**/*peerjs*.js', route => {
    route.fulfill({ contentType: 'application/javascript', body: peerMock });
  });
});

test('loads the menu without script errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('.title')).toHaveText('mechanical war.io');
  await expect(page.locator('#enter')).toBeVisible();
  expect(errors).toEqual([]);
});

test('enters a rendered office scene with the mocked host', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.locator('#name').fill('Tester');
  await page.locator('#team1').click();
  await page.locator('#enter').click();

  await expect.poll(
    () => page.evaluate(() => !document.getElementById('hud').classList.contains('hide')),
    { timeout: 10000 }
  ).toBe(true);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect(page.locator('#held')).toHaveText('Unarmed');

  await page.waitForTimeout(500);
  const canvasSize = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas ? { width: canvas.clientWidth, height: canvas.clientHeight } : null;
  });
  expect(canvasSize.width).toBeGreaterThan(1000);
  expect(canvasSize.height).toBeGreaterThan(600);
  expect(errors).toEqual([]);
});

test('respawns in the same room after elimination', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.locator('#name').fill('Respawner');
  await page.locator('#team1').click();
  await page.locator('#enter').click();

  await expect.poll(
    () => page.evaluate(() => !document.getElementById('hud').classList.contains('hide')),
    { timeout: 10000 }
  ).toBe(true);
  await page.evaluate(() => damage(250, 'Test enemy'));
  await expect(page.locator('#dead')).toBeVisible();
  await expect(page.locator('#hp')).toHaveText('0');
  await expect(page.locator('#respawn')).toBeVisible();

  const respawned = await page.evaluate(() => {
    respawn();
    return {
      deadHidden: document.getElementById('dead').classList.contains('hide'),
      hudVisible: !document.getElementById('hud').classList.contains('hide'),
      hp: document.getElementById('hp').textContent,
      held: document.getElementById('held').textContent,
      feed: document.getElementById('feed').textContent
    };
  });
  expect(respawned).toEqual({
    deadHidden: true,
    hudVisible: true,
    hp: '200',
    held: 'Unarmed',
    feed: expect.stringContaining('Respawned')
  });
  expect(errors).toEqual([]);
});

test('host bulk sync can clear a dropped weapon', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.locator('#name').fill('Dropper');
  await page.locator('#team1').click();
  await page.locator('#enter').click();

  await expect.poll(
    () => page.evaluate(() => !document.getElementById('hud').classList.contains('hide')),
    { timeout: 10000 }
  ).toBe(true);

  const dropped = await page.evaluate(() => {
    me.gun = 'ak47';
    me.ammo = GUN.ak47.mag;
    me.res = GUN.ak47.res;
    players.set(myId, pack());
    handle({
      type: 'bulk',
      players: [{ ...pack(), gun: null, ammo: 0, res: 0 }]
    });
    return {
      gun: me.gun,
      ammo: document.getElementById('ammo').textContent,
      res: document.getElementById('res').textContent,
      held: document.getElementById('held').textContent
    };
  });

  expect(dropped).toEqual({
    gun: null,
    ammo: '0',
    res: '0',
    held: 'Unarmed'
  });
  expect(errors).toEqual([]);
});
