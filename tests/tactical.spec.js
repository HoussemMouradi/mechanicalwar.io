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
  await page.evaluate(() => window.mw.game.setPaused(false));
}

// Real keyboard interactions, with movement placed deterministically beside an
// actual map item. This avoids fragile software-WebGL walks across the office.
async function aimAtPickup(page, kind, category = 'supply') {
  const id = await page.evaluate(({ kind, category }) => {
    const g = window.mw.game;
    const items = category === 'supply' ? g.supplies : g.guns;
    const item = [...items.values()].find(i => (i.kind || i.type) === kind && !i.heldBy);
    if (!item) throw new Error(`Missing map pickup: ${kind}`);
    g.setPaused(false);
    g.keys.clear();
    g.me.vel.set(0, 0, 0);
    g.recoil.x = g.recoil.y = g.camDip = g.shake = 0;
    for (const [dx, dz] of [[0, 1.1], [1.1, 0], [0, -1.1], [-1.1, 0]]) {
      const x = item.x + dx, z = item.z + dz;
      if (g.overlaps(x, 0, z, 1.8)) continue;
      g.me.pos.set(x, 0, z);
      g.me.onGround = true;
      g.me.yaw = Math.atan2(dx, dz);
      g.me.pitch = Math.atan2(item.y - 1.64, Math.hypot(dx, dz));
      g.camY = 1.64;
      g.updateCamera(0);
      const target = g.interactTarget();
      if (target?.o.id === item.id) {
        g.request({ type: 'st', ...g.localState() });
        return item.id;
      }
    }
    throw new Error(`No accessible aim point for ${kind}: ${item.id}`);
  }, { kind, category });
  await expect.poll(() => page.evaluate(() => window.mw.game.interactTarget()?.o.id)).toBe(id);
  return id;
}

async function pickupSupply(page, kind) {
  const id = await aimAtPickup(page, kind);
  await page.keyboard.press('KeyE');
  await expect.poll(() => page.evaluate(id => window.mw.game.supplies.has(id), id)).toBe(false);
  return id;
}

async function settlePlayer(page) {
  await page.evaluate(() => {
    const g = window.mw.game;
    g.keys.clear(); g.me.vel.set(0, 0, 0);
    g.request({ type: 'st', ...g.localState() });
  });
}

test('ground armor is equipped with E and HUD follows separate body/head damage', async ({ page }) => {
  const errors = collectErrors(page);
  await mockPeer(page, { offline: true });
  await enterOffice(page);
  const vestId = await pickupSupply(page, 'vest1');
  await pickupSupply(page, 'helmet');
  await expect(page.locator('#armorVal')).toContainText('100');
  await expect(page.locator('#helmetVal')).toContainText('80');

  // A forged id, replay of the removed vest, and real distant loot must not
  // change inventory. These requests travel through the same host dispatch.
  const rejected = await page.evaluate(vestId => {
    const g = window.mw.game, p = g.host.players.get(g.me.id);
    const before = JSON.stringify(g.host.vitals(p));
    const far = [...g.host.supplies.values()].find(s => s.x > 25 && s.kind === 'vest2') ||
      [...g.host.supplies.values()].find(s => Math.hypot(s.x - p.x, s.z - p.z) > 20);
    for (const id of ['fabricated-loot', vestId, far.id]) g.request({ type: 'supplyPickup', id });
    return { unchanged: before === JSON.stringify(g.host.vitals(p)), farPresent: g.host.supplies.has(far.id) };
  }, vestId);
  expect(rejected).toEqual({ unchanged: true, farPresent: true });

  const body = await page.evaluate(() => {
    const g = window.mw.game, p = g.host.players.get(g.me.id);
    g.host.damage(p, 40, { id: 'test-attacker', team: 2, x: p.x + 2, z: p.z }, 'glock', false);
    return { hp: g.me.hp, armor: g.me.armor.hp, helmet: g.me.helmet.hp };
  });
  expect(body.hp).toBeGreaterThan(60);
  expect(body.hp).toBeLessThan(100);
  expect(body.armor).toBeLessThan(100);
  expect(body.helmet).toBe(80);
  await expect(page.locator('#hpVal')).toHaveText(String(body.hp));
  await expect(page.locator('#armorVal')).toContainText(String(body.armor));

  const head = await page.evaluate(() => {
    const g = window.mw.game, p = g.host.players.get(g.me.id);
    g.host.damage(p, 40, { id: 'test-attacker', team: 2, x: p.x + 2, z: p.z }, 'glock', true);
    return { hp: g.me.hp, armor: g.me.armor.hp, helmet: g.me.helmet.hp };
  });
  expect(body.hp - head.hp).toBeLessThan(40);
  expect(head.armor).toBe(body.armor);
  expect(head.helmet).toBeLessThan(body.helmet);
  await expect(page.locator('#helmetVal')).toContainText(String(head.helmet));
  expect(errors).toEqual([]);
});

test('H healing can be interrupted and B boosts regenerate without replaying inventory', async ({ page }) => {
  const errors = collectErrors(page);
  await mockPeer(page, { offline: true });
  await enterOffice(page);
  await pickupSupply(page, 'bandage');
  await pickupSupply(page, 'firstaid');
  await pickupSupply(page, 'energy');
  await expect(page.locator('#bandageCount')).toHaveText('3');
  await expect(page.locator('#firstaidCount')).toHaveText('1');
  await expect(page.locator('#energyCount')).toHaveText('1');
  await page.evaluate(() => {
    const g = window.mw.game, p = g.host.players.get(g.me.id);
    p.hp = 30; g.host.sendVitals(p);
  });

  await page.keyboard.press('KeyH');
  await expect.poll(() => page.evaluate(() => window.mw.game.me.using?.item)).toBe('firstaid');
  await expect(page.locator('#useProgress')).toBeVisible();
  await expect(page.locator('#useProgress')).toHaveClass(/show/);
  await expect(page.locator('#useLabel')).toContainText(/first aid/i);
  await page.keyboard.down('KeyW');
  try {
    await expect.poll(() => page.evaluate(() => window.mw.game.me.using), { timeout: 8000 }).toBeNull();
  } finally {
    await page.keyboard.up('KeyW');
  }
  expect(await page.evaluate(() => ({ hp: window.mw.game.me.hp, kits: window.mw.game.me.bag.firstaid })))
    .toEqual({ hp: 30, kits: 1 });
  await settlePlayer(page);

  await page.keyboard.press('KeyH');
  await expect.poll(() => page.evaluate(() => window.mw.game.me.using?.item)).toBe('firstaid');
  await page.evaluate(() => {
    const g = window.mw.game, p = g.host.players.get(g.me.id);
    g.host.damage(p, 5, { id: 'test-attacker', team: 2, x: p.x + 2, z: p.z }, 'glock', false);
  });
  await expect.poll(() => page.evaluate(() => window.mw.game.me.using)).toBeNull();
  await expect(page.locator('#firstaidCount')).toHaveText('1');

  await page.keyboard.press('KeyH');
  await expect.poll(() => page.evaluate(() => window.mw.game.me.using?.item)).toBe('firstaid');
  // Advance the authoritative timer, retaining actual key/UI/protocol coverage.
  await page.evaluate(() => window.mw.game.host.simulateSurvival(5.1));
  await expect(page.locator('#hpVal')).toHaveText('75');
  await expect(page.locator('#firstaidCount')).toHaveText('0');
  await expect.poll(() => page.evaluate(() => window.mw.game.me.using)).toBeNull();
  await page.evaluate(() => window.mw.game.request({ type: 'useSupply', item: 'firstaid' }));
  expect(await page.evaluate(() => window.mw.game.me.using)).toBeNull();

  await page.keyboard.press('KeyB');
  await expect.poll(() => page.evaluate(() => window.mw.game.me.using?.item)).toBe('energy');
  await page.evaluate(() => {
    const g = window.mw.game;
    g.host.simulateSurvival(3.1); g.host.sendVitals(g.host.players.get(g.me.id));
  });
  await expect(page.locator('#energyCount')).toHaveText('0');
  const boosted = await page.evaluate(() => ({ hp: window.mw.game.me.hp, boost: window.mw.game.me.boost }));
  expect(boosted.boost).toBeGreaterThan(30);
  await page.evaluate(() => {
    const g = window.mw.game;
    g.host.simulateSurvival(4); g.host.sendVitals(g.host.players.get(g.me.id));
  });
  const healed = await page.evaluate(() => ({ hp: window.mw.game.me.hp, boost: window.mw.game.me.boost }));
  expect(healed.hp).toBeGreaterThan(boosted.hp);
  expect(healed.boost).toBeLessThan(boosted.boost);
  expect(healed.hp).toBeLessThanOrEqual(100);
  expect(errors).toEqual([]);
});

test('F and X throw owned grenades and smoke effects clear after expiry', async ({ page }) => {
  const errors = collectErrors(page);
  await mockPeer(page, { offline: true });
  await enterOffice(page);
  await pickupSupply(page, 'frag');
  await pickupSupply(page, 'smoke');
  await page.evaluate(() => {
    const g = window.mw.game;
    g.me.pos.set(0, 0, -6); g.me.yaw = 0; g.me.pitch = 0;
    g.updateCamera(1); g.request({ type: 'st', ...g.localState() });
  });
  await page.keyboard.press('KeyF');
  await expect.poll(() => page.evaluate(() => [...window.mw.game.grenades.values()].some(n => n.kind === 'frag'))).toBe(true);
  await expect(page.locator('#fragCount')).toHaveText('0');
  const thrown = await page.evaluate(() => {
    const g = window.mw.game, n = [...g.host.grenades.values()].find(n => n.kind === 'frag');
    const z = n.z;
    g.host.simulateGrenades(0.15);
    return { distance: Math.abs(n.z - z), mesh: !!g.grenades.get(n.id)?.mesh };
  });
  expect(thrown.distance).toBeGreaterThan(0.1);
  expect(thrown.mesh).toBe(true);
  await page.evaluate(() => {
    const g = window.mw.game, n = [...g.host.grenades.values()].find(n => n.kind === 'frag');
    n.remaining = 0.01; g.host.simulateGrenades(0.02);
  });
  await expect.poll(() => page.evaluate(() => [...window.mw.game.grenades.values()].some(n => n.kind === 'frag'))).toBe(false);

  // Avoid coupling the smoke assertion to the anti-spam throw cooldown.
  await page.evaluate(() => { const g = window.mw.game; g.host.players.get(g.me.id).lastGrenade = -Infinity; });
  await page.keyboard.press('KeyX');
  await expect(page.locator('#smokeCount')).toHaveText('0');
  await expect.poll(() => page.evaluate(() => [...window.mw.game.grenades.values()].some(n => n.kind === 'smoke'))).toBe(true);
  await page.evaluate(() => {
    const g = window.mw.game, n = [...g.host.grenades.values()].find(n => n.kind === 'smoke');
    n.remaining = 0.01; g.host.simulateGrenades(0.02);
  });
  await expect.poll(() => page.evaluate(() => window.mw.game.smokeEffects.clouds.size)).toBe(1);
  await expect.poll(() => page.evaluate(() => [...window.mw.game.host.grenades.values()].some(n => n.smoking))).toBe(true);
  const concealment = await page.evaluate(() => {
    const g = window.mw.game, cloud = [...g.smokeEffects.clouds.values()][0];
    g.camera.position.copy(cloud.center);
    g.updateSupplies(1, performance.now());
    return {
      opacity: Number(document.getElementById('smokeVeil').style.opacity),
      obstructs: g.smokeEffects.obscures(cloud.center.clone().addScalar(-2), cloud.center.clone().addScalar(2)),
    };
  });
  expect(concealment.opacity).toBeGreaterThan(0.5);
  expect(concealment.obstructs).toBe(true);
  await page.evaluate(() => window.mw.game.host.simulateGrenades(16.1));
  await expect.poll(() => page.evaluate(() => window.mw.game.smokeEffects.clouds.size)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.mw.game.grenades.size)).toBe(0);
  expect(errors).toEqual([]);
});

test('new rifles and SMGs have ground/view models and reload through R', async ({ page }) => {
  const errors = collectErrors(page);
  await mockPeer(page, { offline: true });
  await enterOffice(page);
  for (const [type, label, magazine] of [['ump45', 'UMP-45', 25], ['scar', 'SCAR-L', 30]]) {
    const id = await aimAtPickup(page, type, 'gun');
    await page.keyboard.press('KeyE');
    await expect.poll(() => page.evaluate(() => window.mw.game.me.inv.primary?.type)).toBe(type);
    await expect(page.locator('#weaponName')).toHaveText(label);
    const rendered = await page.evaluate(id => {
      const g = window.mw.game, weapon = g.vm.userData.weapon;
      let geometry = 0;
      weapon.traverse(o => { if (o.isMesh) geometry += o.geometry.attributes.position.count; });
      return { vertices: geometry, magazine: !!weapon.userData.parts.mag, held: g.guns.get(id).heldBy === g.me.id };
    }, id);
    expect(rendered.vertices).toBeGreaterThan(100);
    expect(rendered.magazine).toBe(true);
    expect(rendered.held).toBe(true);
    const before = await page.evaluate(() => {
      const g = window.mw.game;
      g.me.inv.primary.ammo = 1; g.updateHudWeapon();
      return g.me.inv.primary.res;
    });
    await page.keyboard.press('KeyR');
    await expect.poll(() => page.evaluate(() => window.mw.game.wep.reloadT)).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.mw.game.me.inv.primary.ammo), { timeout: 15000 }).toBe(magazine);
    expect(await page.evaluate(() => window.mw.game.me.inv.primary.res)).toBe(before - magazine + 1);
    await expect(page.locator('#ammoVal')).toHaveText(String(magazine));
  }
  expect(errors).toEqual([]);
});

test('late joiners receive depleted loot, armor and active smoke from the host', async ({ context }, testInfo) => {
  test.setTimeout(120000);
  const hostPage = await context.newPage(), joinPage = await context.newPage();
  const hostErrors = collectErrors(hostPage), joinErrors = collectErrors(joinPage);
  await mockPeer(hostPage); await mockPeer(joinPage);
  await enterOffice(hostPage, { team: 1, name: 'Armored host' });
  // This is a synchronization test: one software-WebGL renderer is enough.
  // Host movement, input, visual state and the worker-driven net tick keep
  // running; only submitting its duplicate image to the GPU is skipped.
  await hostPage.evaluate(() => { window.mw.game.render = () => {}; });
  const vestId = await pickupSupply(hostPage, 'vest1');
  const smokeId = await pickupSupply(hostPage, 'smoke');
  await hostPage.keyboard.press('KeyX');
  await expect.poll(() => hostPage.evaluate(() => window.mw.game.host.grenades.size)).toBe(1);
  await hostPage.evaluate(() => {
    const g = window.mw.game, n = [...g.host.grenades.values()][0];
    n.remaining = 0.01; g.host.simulateGrenades(0.02);
    // Joining/loading under software WebGL must not expire this fixture first.
    n.remaining = 60;
    for (const entry of g.host.supplyRespawns.values()) entry.remaining = 120;
    g.host.emit({ type: 'grenades', list: g.host.grenadeList() });
  });
  await enterOffice(joinPage, { team: 2, name: 'Late joiner' });
  const initial = await joinPage.evaluate(() => ({
    role: window.mw.game.role,
    remotes: [...window.mw.game.remotes.values()].map(p => ({ name: p.name, armor: p.armor, hp: p.hp })),
    clouds: window.mw.game.smokeEffects.clouds.size,
  }));
  await testInfo.attach('late-join-state', { body: JSON.stringify(initial, null, 2), contentType: 'application/json' });
  expect(initial.role).toBe('client');
  await expect.poll(() => joinPage.evaluate(() => [...window.mw.game.remotes.values()].find(p => p.name === 'Armored host')?.armor?.hp)).toBe(100);
  const state = await joinPage.evaluate(({ vestId, smokeId }) => {
    const g = window.mw.game;
    return { vest: g.supplies.has(vestId), smoke: g.supplies.has(smokeId), clouds: g.smokeEffects.clouds.size, armor: g.me.armor, bag: g.me.bag.smoke };
  }, { vestId, smokeId });
  expect(state).toEqual({ vest: false, smoke: false, clouds: 1, armor: null, bag: 0 });
  await hostPage.evaluate(() => {
    const g = window.mw.game;
    for (const n of g.host.grenades.values()) n.remaining = 0.01;
    g.host.simulateGrenades(0.02);
  });
  await expect.poll(() => joinPage.evaluate(() => window.mw.game.smokeEffects.clouds.size)).toBe(0);
  expect(hostErrors).toEqual([]);
  expect(joinErrors).toEqual([]);
});
