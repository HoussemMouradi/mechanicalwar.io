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
  await page.route('**/peerjs@1.5.4/dist/peerjs.min.js', route => {
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

  await expect(page.locator('#hud')).toBeVisible();
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
