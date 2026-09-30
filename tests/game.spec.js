const { test, expect } = require('@playwright/test');
const { localRuntime } = require('./local-runtime');
test.beforeEach(async ({ context }) => localRuntime(context));

// A tiny in-browser PeerJS stand-in. Pages in the same browser context share a
// "broker" through BroadcastChannel + localStorage, so two tabs can really play together.
const peerMock = `
(() => {
  const bc = new BroadcastChannel('mock-peer-broker');
  const local = new Map();
  const uid = () => Math.random().toString(36).slice(2, 10);
  const claimKey = id => 'mockpeer:' + id;

  class Conn {
    constructor(owner, remote, cid) { this.owner = owner; this.peer = remote; this.cid = cid; this.open = false; this.h = {}; }
    on(evt, fn) { this.h[evt] = fn; }
    fire(evt, arg) { this.h[evt]?.(arg); }
    send(data) { if (this.open) bc.postMessage({ kind: 'data', cid: this.cid, to: this.peer, data }); }
    close() {
      if (!this.open) return;
      this.open = false;
      bc.postMessage({ kind: 'close', cid: this.cid, to: this.peer });
      this.fire('close');
    }
  }

  class MockPeer {
    constructor(id) {
      this.id = id || 'anon-' + uid();
      this.h = {}; this.conns = new Map(); this.destroyed = false;
      setTimeout(() => {
        const owner = localStorage.getItem(claimKey(this.id));
        if (owner && owner !== this.token) return this.fire('error', { type: 'unavailable-id' });
        this.token = uid();
        localStorage.setItem(claimKey(this.id), this.token);
        local.set(this.id, this);
        this.fire('open', this.id);
      }, 30);
    }
    on(evt, fn) { this.h[evt] = fn; }
    fire(evt, arg) { this.h[evt]?.(arg); }
    connect(target) {
      const c = new Conn(this, target, uid());
      this.conns.set(c.cid, c);
      bc.postMessage({ kind: 'connect', cid: c.cid, from: this.id, to: target });
      setTimeout(() => { if (!c.open) c.fire('error', new Error('timeout')); }, 3000);
      return c;
    }
    reconnect() {}
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      for (const c of this.conns.values()) c.close();
      if (localStorage.getItem(claimKey(this.id)) === this.token) localStorage.removeItem(claimKey(this.id));
      local.delete(this.id);
    }
  }

  bc.onmessage = ({ data: m }) => {
    const p = local.get(m.to);
    if (!p || p.destroyed) return;
    if (m.kind === 'connect') {
      const c = new Conn(p, m.from, m.cid);
      p.conns.set(c.cid, c);
      p.fire('connection', c);
      c.open = true;
      bc.postMessage({ kind: 'accept', cid: c.cid, to: m.from });
      setTimeout(() => c.fire('open'), 0);
      return;
    }
    const c = p.conns.get(m.cid);
    if (!c) return;
    if (m.kind === 'accept') { c.open = true; c.fire('open'); }
    else if (m.kind === 'data') c.fire('data', m.data);
    else if (m.kind === 'close') { c.open = false; c.fire('close'); }
  };
  addEventListener('pagehide', () => { for (const p of local.values()) p.destroy(); });
  window.Peer = MockPeer;
})();
`;

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function mockPeer(page, { offline = false } = {}) {
  // Software WebGL in CI is slow; low quality keeps the simulation stepping at a useful rate.
  await page.addInitScript(() => {
    localStorage.setItem('mw.settings.v4', JSON.stringify({ sensitivity: 1, fov: 80, quality: 'low', volume: 0 }));
  });
  await page.route('**/*peerjs*.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: offline ? 'window.Peer = undefined;' : peerMock,
  }));
}

async function enterOffice(page, { team = 1, char = 'manager', name = 'Tester' } = {}) {
  await page.goto('/');
  await page.fill('#name', name);
  await page.click(`.team-card[data-team="${team}"]`);
  await page.click(`.char-card[data-char="${char}"]`);
  await page.click('#play');
  await page.waitForFunction(() => window.mw.game?.ready === true, null, { timeout: 25000 });
  await page.evaluate(() => {
    const g = window.mw.game;
    g.setPaused(false);
    // These tests assert input, simulation, model transforms, network and HUD.
    // The dedicated graphics suite submits full frames for every quality preset.
    // Avoid tying real-time gameplay timers to a CI software GPU's frame time.
    g.renderNow = g.render.bind(g);
    g.render = () => {};
  });
}

test('menu has one Play button, three departments and selectable characters', async ({ page }) => {
  const errors = collectErrors(page);
  await mockPeer(page);
  await page.goto('/');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#play')).toBeVisible();
  for (const legacy of ['#host', '#join', '#enter', '#quickPlay', '#roomCode', '#rooms']) await expect(page.locator(legacy)).toHaveCount(0);
  await expect(page.getByText(/quick play|host room|join room/i)).toHaveCount(0);

  const teams = page.locator('.team-card');
  await expect(teams).toHaveCount(3);
  await expect(teams.nth(0)).toContainText('AUTO');
  await expect(teams.nth(1)).toContainText('DJB');
  await expect(teams.nth(2)).toContainText('RH');

  const chars = page.locator('.char-card');
  await expect(chars).toHaveCount(6);
  await expect(page.locator('.char-card[data-char="manager"]')).toContainText('Manager');
  await expect(page.locator('.char-card[data-char="vape"]')).toContainText('Vape');
  await page.click('.char-card[data-char="vape"]');
  await expect(page.locator('.char-card[data-char="vape"]')).toHaveClass(/selected/);
  await expect(page.locator('#charName')).toContainText('Vape');
  expect(errors.all || errors).toEqual([]);
});

test('RH says "nope, get out" and can never be selected', async ({ page }) => {
  await mockPeer(page);
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('.team-card[data-team="rh"]');
  await expect(page.locator('#denied')).toBeVisible();
  await expect(page.locator('#denied')).toContainText('nope, get out');
  await expect(page.locator('.team-card[data-team="rh"]')).not.toHaveClass(/selected/);
  expect(await page.evaluate(() => window.mw.menu.profile.team)).not.toBe('rh');

  await page.click('#play');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menuMsg')).toContainText(/AUTO or DJB/);

  await page.click('.team-card[data-team="2"]');
  await expect(page.locator('.team-card[data-team="2"]')).toHaveClass(/selected/);
});

test('Play drops you straight into the single office room (offline fallback)', async ({ page }) => {
  const errors = collectErrors(page);
  await mockPeer(page, { offline: true });
  await enterOffice(page, { team: 2, char: 'vape' });
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
  const state = await page.evaluate(() => {
    const g = window.mw.game;
    return {
      role: g.role, team: g.me.team, char: g.me.char, hp: g.me.hp,
      colliders: g.world.colliders.length, props: g.props.size, guns: g.guns.size,
      desks: g.world.colliders.filter(c => Math.abs(c.y + c.hy - 0.75) < 0.03 && c.hx > 0.5).length,
      propTypes: [...new Set([...g.props.values()].map(p => p.type))],
    };
  });
  expect(state.role).toBe('offline');
  expect(state.team).toBe(2);
  expect(state.char).toBe('vape');
  expect(state.hp).toBe(100);
  expect(state.colliders).toBeGreaterThan(150);
  expect(state.desks).toBeGreaterThanOrEqual(8);
  expect(state.guns).toBeGreaterThan(5);
  expect(state.props).toBeGreaterThan(40);
  expect(state.propTypes).toEqual(expect.arrayContaining(['keyboard', 'mug', 'monitor', 'chair']));
  await expect(page.locator('#scoreTop')).toContainText('AUTO');
  await expect(page.locator('#scoreTop')).toContainText('DJB');
  expect(errors.all || errors).toEqual([]);
});

test('you can land on top of a desk', async ({ page }) => {
  await mockPeer(page, { offline: true });
  await enterOffice(page);
  await page.evaluate(() => {
    const g = window.mw.game;
    const desk = g.world.colliders.find(c => Math.abs(c.y + c.hy - 0.75) < 0.03 && c.hx > 0.5 && c.hz > 0.3);
    window.testDesk = desk;
    g.me.pos.set(desk.x, 1.6, desk.z);
    g.me.vel.set(0, 0, 0);
    g.me.onGround = false;
  });
  await page.waitForFunction(() => window.mw.game.me.onGround, null, { timeout: 15000 });
  const top = await page.evaluate(() => {
    const g = window.mw.game, desk = window.testDesk;
    return { y: g.me.pos.y, onGround: g.me.onGround, deskTop: desk.y + desk.hy };
  });
  expect(top.onGround).toBe(true);
  expect(Math.abs(top.y - top.deskTop)).toBeLessThan(0.05);
});

test('office props can be grabbed and thrown', async ({ page }) => {
  await mockPeer(page, { offline: true });
  await enterOffice(page);
  const result = await page.evaluate(async () => {
    const g = window.mw.game;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const prop = [...g.props.values()].find(p => p.type === 'keyboard' && p.state === 'rest');
    const start = { x: prop.x, z: prop.z };
    g.me.pos.set(prop.x + 1, 0, prop.z);
    g.me.yaw = Math.PI / 2;
    await wait(300);
    g.request({ type: 'grab', id: prop.id });
    await wait(200);
    const held = g.me.prop?.id === prop.id && g.me.slot === 'prop';
    g.throwProp(1);
    const flying = g.host.props.get(prop.id), launch = [flying.x, flying.y, flying.z];
    let automaticProgress = false;
    for (let n = 0; n < 20 && !automaticProgress; n++) {
      await wait(50);
      automaticProgress = Math.hypot(flying.x - launch[0], flying.y - launch[1], flying.z - launch[2]) > 0.01;
    }
    // Advance real host physics in bounded steps instead of assuming that a
    // software-rendered tab can simulate 2.5 seconds in 2.5 wall-clock seconds.
    for (let frame = 0; frame < 360 && g.host.props.get(prop.id).state === 'fly'; frame++) g.host.simulateProps(1 / 60);
    return { held, automaticProgress, state: prop.state, moved: Math.hypot(prop.x - start.x, prop.z - start.z), stillHolding: !!g.me.prop };
  });
  expect(result.held).toBe(true);
  expect(result.automaticProgress).toBe(true);
  expect(result.stillHolding).toBe(false);
  expect(result.state).toBe('rest');
  expect(result.moved).toBeGreaterThan(1.5);
  await page.evaluate(() => window.mw.game.renderNow());
});

test('two tabs share the one room: first hosts, second joins and can shoot', async ({ context }) => {
  test.setTimeout(120000);
  const a = await context.newPage();
  const b = await context.newPage();
  const aErrors = collectErrors(a), bErrors = collectErrors(b);
  const errors = { get all() { return [...aErrors, ...bErrors]; } };
  await mockPeer(a);
  await mockPeer(b);
  await enterOffice(a, { team: 1, char: 'manager', name: 'Boss' });
  await enterOffice(b, { team: 2, char: 'vape', name: 'Cloud' });

  expect(await a.evaluate(() => window.mw.game.role)).toBe('host');
  expect(await b.evaluate(() => window.mw.game.role)).toBe('client');
  await expect.poll(() => a.evaluate(() => [...window.mw.game.remotes.values()].map(r => r.name))).toContain('Cloud');
  await expect.poll(() => b.evaluate(() => [...window.mw.game.remotes.values()].map(r => r.name))).toContain('Boss');

  await a.evaluate(() => { const g = window.mw.game; g.me.pos.set(0, 0, -6); g.me.yaw = 0; });
  await b.evaluate(() => { const g = window.mw.game; g.me.pos.set(0, 0, -1); g.me.yaw = 0; g.me.pitch = -0.08; });
  await expect.poll(() => b.evaluate(() => {
    const r = [...window.mw.game.remotes.values()][0];
    return Math.abs(r.rz + 6) < 0.3;
  })).toBe(true);
  console.log(await b.evaluate(() => {
    const g = window.mw.game, o = g.camera.position.clone(), d = g.forward();
    const wall = g.castWorld(o, d, 100), r = [...g.remotes.values()][0];
    const t = g.castPlayers(o, d, wall.dist);
    return JSON.stringify({ o, d, wall: wall.dist, t: t && t.t, r: [r.rx, r.ry, r.rz, r.alive, r.team], me: g.me.team, head: r.rig.head.getWorldPosition(o.clone()) });
  }));
  // The host only accepts primary-weapon hits for guns it granted, so shoot with the spawn Glock.
  await b.evaluate(async () => {
    const g = window.mw.game;
    g.equip('secondary', true);
    g.wep.drawT = 0;
    for (let i = 0; i < 4; i++) { g.wep.cd = 0; g.wep.fired = false; g.fire(); await new Promise(r => setTimeout(r, 150)); }
  });
  await expect.poll(() => a.evaluate(() => window.mw.game.me.hp), { timeout: 5000 }).toBeLessThan(100);
  await a.evaluate(() => window.mw.game.renderNow());
  await b.evaluate(() => window.mw.game.renderNow());
  expect(errors.all || errors).toEqual([]);
});
