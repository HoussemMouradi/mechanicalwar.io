const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Exercise the real host and survival modules without WebGL. Only prop physics
// is stubbed; none of these scenarios create props or depend on its behavior.
let Host, SUPPLIES, clearSegment, stepGrenade;
test.beforeAll(async () => {
  const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');
  const url = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
  const survival = url(source('survival.js'));
  const host = source('host.js')
    .replace("'./config.js'", JSON.stringify(url(source('config.js'))))
    .replace("import { stepProp } from './props.js';", 'const stepProp = () => { throw new Error("Unexpected prop simulation"); };')
    .replace("'./survival.js'", JSON.stringify(survival));
  ({ Host } = await import(url(host)));
  ({ SUPPLIES, clearSegment, stepGrenade } = await import(survival));
});

function fixture() {
  const messages = [];
  const game = {
    me: { id: 'local' },
    world: { gunSpots: [], propSpots: [], colliders: [], bounds: { minX: -40, maxX: 40, minZ: -28, maxZ: 28 },
      spawns: { 1: [{ x: -10, z: 0, yaw: 0 }], 2: [{ x: 10, z: 0, yaw: 0 }] } },
    net: { broadcast() {}, sendTo() {}, kick() {} },
    apply: m => messages.push(structuredClone(m)), localState: () => ({}),
  };
  const host = new Host(game);
  const add = (id, team, x, z = 0) => { const p = host.addPlayer({ id, team, name: id }).player; Object.assign(p, { x, y: 0, z }); return p; };
  return { host, game, messages, a: add('a', 1, 0), b: add('b', 2, 3), friend: add('c', 1, 3, 1) };
}

function loot(host, id, kind, x = 1, z = 0) { host.supplies.set(id, { id, kind, x, y: 0.16, z }); }

test('supply pickup is range/wall/phase checked, single-use, capped and cannot downgrade gear', () => {
  const { host, a } = fixture();
  loot(host, 'wallkit', 'firstaid');
  host.world.colliders.push({ x: 0.5, y: 1, z: 0, hx: 0.08, hy: 1, hz: 2 });
  host.handle(a.id, { type: 'supplyPickup', id: 'wallkit' });
  expect(a.bag.firstaid).toBe(0);
  host.world.colliders = [];
  a.x = -5;
  host.handle(a.id, { type: 'supplyPickup', id: 'wallkit' });
  expect(a.bag.firstaid).toBe(0);
  a.x = 0;
  host.handle(a.id, { type: 'supplyPickup', id: 'wallkit' });
  host.handle(a.id, { type: 'supplyPickup', id: 'wallkit' });
  expect(a.bag.firstaid).toBe(1);
  expect(host.supplies.has('wallkit')).toBe(false);
  a.bag.bandage = 7;
  loot(host, 'band', 'bandage'); host.handle(a.id, { type: 'supplyPickup', id: 'band' });
  expect(a.bag.bandage).toBe(8);
  loot(host, 'fullbag', 'bandage'); host.handle(a.id, { type: 'supplyPickup', id: 'fullbag' });
  expect(host.supplies.has('fullbag')).toBe(true);
  loot(host, 'vest', 'vest2'); host.handle(a.id, { type: 'supplyPickup', id: 'vest' });
  a.armor.hp = 50;
  loot(host, 'downgrade', 'vest1'); host.handle(a.id, { type: 'supplyPickup', id: 'downgrade' });
  expect(a.armor).toEqual({ tier: 2, hp: 50, max: 150 });
  expect(host.supplies.has('downgrade')).toBe(true);
  host.phase = 'end'; loot(host, 'end', 'energy'); host.handle(a.id, { type: 'supplyPickup', id: 'end' });
  expect(a.bag.energy).toBe(0);
});

test('armor and helmet mitigate separate hit zones, wear out, and knife bypasses armor', () => {
  const { host, a, b } = fixture();
  b.armor = { tier: 2, hp: 150, max: 150 }; b.helmet = { tier: 1, hp: 80, max: 80 };
  host.damage(b, 50, a, 'ak47', false);
  expect(b.hp).toBe(70); expect(b.armor.hp).toBe(130); expect(b.helmet.hp).toBe(80);
  host.damage(b, 40, a, 'ak47', true);
  expect(b.hp).toBe(50); expect(b.helmet.hp).toBe(60); expect(b.armor.hp).toBe(130);
  b.armor.hp = 5;
  host.damage(b, 20, a, 'ak47', false);
  expect(b.hp).toBe(35); expect(b.armor).toBeNull();
  b.armor = { tier: 1, hp: 100, max: 100 };
  host.damage(b, 10, a, 'knife', false);
  expect(b.hp).toBe(25); expect(b.armor.hp).toBe(100);
});

test('timed healing consumes on completion and cancels on damage, firing or movement', () => {
  const { host, a, b } = fixture();
  a.hp = 20; a.bag.bandage = 3; a.bag.firstaid = 1;
  host.handle(a.id, { type: 'useSupply', item: 'bandage' });
  host.simulateSurvival(2);
  expect(a.hp).toBe(20); expect(a.bag.bandage).toBe(3);
  host.damage(a, 1, b, 'glock', false);
  expect(a.using).toBeNull(); expect(a.bag.bandage).toBe(3);
  host.handle(a.id, { type: 'useSupply', item: 'bandage' });
  host.handle(a.id, { type: 'fire', w: 'glock' });
  expect(a.using).toBeNull();
  host.handle(a.id, { type: 'useSupply', item: 'bandage' });
  host.handle(a.id, { type: 'st', x: 1, y: 0, z: 0 });
  expect(a.using).toBeNull();
  host.handle(a.id, { type: 'useSupply', item: 'firstaid' });
  host.simulateSurvival(SUPPLIES.firstaid.duration);
  expect(a.hp).toBe(75); expect(a.bag.firstaid).toBe(0); expect(a.using).toBeNull();
  host.handle(a.id, { type: 'useSupply', item: 'bandage' });
  expect(a.using).toBeNull();
});

test('energy regenerates above the healing cap, finishes at full health and cannot grant unowned items', () => {
  const { host, a } = fixture();
  a.hp = 75;
  host.handle(a.id, { type: 'useSupply', item: 'energy' });
  expect(a.using).toBeNull();
  a.bag.energy = 1;
  host.handle(a.id, { type: 'useSupply', item: 'energy' });
  host.simulateSurvival(3);
  expect(a.bag.energy).toBe(0); expect(a.boost).toBe(40); expect(a.hp).toBe(75);
  for (let i = 0; i < 50; i++) host.simulateSurvival(1);
  expect(a.hp).toBe(100); expect(a.boost).toBe(0);
});

test('grenades reject invalid throws, consume once, bounce, respect walls and avoid friendly fire', () => {
  const { host, a, b, friend } = fixture();
  host.handle(a.id, { type: 'throwGrenade', kind: 'frag', dir: [1, 0, 0] });
  expect(host.grenades.size).toBe(0);
  a.bag.frag = 2;
  host.handle(a.id, { type: 'throwGrenade', kind: 'frag', dir: [NaN, 0, 0] });
  expect(a.bag.frag).toBe(2);
  host.handle(a.id, { type: 'throwGrenade', kind: 'frag', dir: [1, 0, 0] });
  host.handle(a.id, { type: 'throwGrenade', kind: 'frag', dir: [1, 0, 0] });
  expect(a.bag.frag).toBe(1); expect(host.grenades.size).toBe(1);
  const grenade = [...host.grenades.values()][0];
  Object.assign(grenade, { x: 1, y: 0.1, z: 0, vx: 0, vy: 0, vz: 0, remaining: 0 });
  host.world.colliders = [{ x: 2, y: 1.7, z: 0, hx: 0.1, hy: 1.7, hz: 2 }];
  host.simulateGrenades(0);
  expect(b.hp).toBe(100); expect(friend.hp).toBe(100); expect(a.hp).toBeLessThan(100);
  host.world.colliders = [];
  a.lastGrenade = -Infinity;
  host.handle(a.id, { type: 'throwGrenade', kind: 'frag', dir: [1, 0, 0] });
  const open = [...host.grenades.values()][0];
  Object.assign(open, { x: 2.5, y: 0.1, z: 0, vx: 0, vy: 0, vz: 0, remaining: 0 });
  host.simulateGrenades(0);
  expect(b.alive).toBe(false); expect(friend.hp).toBe(100);
  const bouncing = { x: 0.8, y: 1, z: 0, vx: 10, vy: 0, vz: 0 };
  stepGrenade(bouncing, 0.02, [{ x: 1.1, y: 1, z: 0, hx: 0.1, hy: 1, hz: 1 }], host.world.bounds);
  expect(bouncing.vx).toBeLessThan(0); expect(bouncing.x).toBeLessThan(0.92);
  expect(clearSegment([0, 1, 0], [2, 1, 0], [{ x: 1, y: 1, z: 0, hx: 0.1, hy: 1, hz: 1 }])).toBe(false);
});

test('smoke persists for late joins then expires; match restart reseeds loot and clears state', () => {
  const { host, a } = fixture();
  a.bag.smoke = 1;
  host.handle(a.id, { type: 'throwGrenade', kind: 'smoke', dir: [1, 0, 0] });
  const smoke = [...host.grenades.values()][0]; smoke.remaining = 0;
  host.simulateGrenades(0);
  const welcome = host.welcome(a);
  expect(welcome.grenades[0].smoking).toBe(true);
  expect(welcome.grenades[0].remaining).toBe(16);
  expect(welcome.vitals.bag.smoke).toBe(0);
  host.simulateGrenades(16.1);
  expect(host.grenades.size).toBe(0);
  a.armor = { tier: 2, hp: 100, max: 150 }; a.boost = 30; a.bag.energy = 3;
  host.supplies.clear(); host.restartMatch();
  expect(host.supplies.size).toBeGreaterThan(20);
  expect(a.hp).toBe(100); expect(a.armor).toBeNull(); expect(a.boost).toBe(0); expect(a.bag.energy).toBe(0);
});

test('local and remote movement messages cannot overwrite authoritative survival state', () => {
  const { host, game, a } = fixture();
  a.hp = 41; a.bag.frag = 1;
  const fake = { x: 0, y: 0, z: 0, hp: 999, alive: true, armor: { tier: 2, hp: 999 }, boost: 100, bag: { frag: 100 } };
  host.handle(a.id, { type: 'st', ...fake });
  game.me.id = a.id; game.localState = () => fake;
  host.tick(0.05);
  expect(a.hp).toBe(41); expect(a.armor).toBeNull(); expect(a.boost).toBe(0); expect(a.bag.frag).toBe(1);
  a.alive = false; host.tick(0.05);
  expect(a.alive).toBe(false);
});
