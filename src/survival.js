// Shared rules and deterministic loot placement. Gameplay decisions run on Host.
export const SUPPLIES = {
  vest1: { name: 'Patrol vest', label: 'VEST · LV 1', category: 'armor', color: 0x779080, tier: 1, durability: 100, reduction: 0.3, respawn: 45 },
  vest2: { name: 'Combat vest', label: 'VEST · LV 2', category: 'armor', color: 0xc99e50, tier: 2, durability: 150, reduction: 0.4, respawn: 55 },
  helmet: { name: 'Ballistic helmet', label: 'HELMET', category: 'helmet', color: 0x7c9270, tier: 1, durability: 80, reduction: 0.5, respawn: 45 },
  bandage: { name: 'Bandages', label: 'BANDAGES ×3', category: 'heal', color: 0xe2ded0, cap: 8, amount: 3, duration: 3, heal: 20, healCap: 75, respawn: 30 },
  firstaid: { name: 'First aid kit', label: 'FIRST AID', category: 'heal', color: 0xe46758, cap: 3, amount: 1, duration: 5, heal: 75, healCap: 75, respawn: 40 },
  energy: { name: 'Energy drink', label: 'ENERGY BOOST', category: 'boost', color: 0x53bdd3, cap: 4, amount: 1, duration: 3, boost: 40, respawn: 35 },
  frag: { name: 'Frag grenade', label: 'FRAG GRENADE', category: 'grenade', color: 0x9aac73, cap: 3, amount: 1, respawn: 35 },
  smoke: { name: 'Smoke grenade', label: 'SMOKE GRENADE', category: 'grenade', color: 0xa0acba, cap: 3, amount: 1, respawn: 30 },
};

export const GRENADE = {
  frag: { fuse: 3, radius: 7, damage: 145, speed: 13, duration: 0 },
  smoke: { fuse: 2, radius: 4.5, damage: 0, speed: 12, duration: 16 },
};

// Equivalent supply routes in both spawn rooms; stronger gear rewards venturing
// into the open-plan office. All coordinates use metres, with y above the floor.
const spawnKit = ['vest1', 'helmet', 'bandage', 'firstaid', 'energy', 'frag', 'smoke'];
const central = [
  ['vest2', -21, 3], ['vest2', 21, -3],
  ['helmet', -25.5, -12], ['helmet', 25.5, 12],
  ['bandage', -15, -3], ['bandage', 15, 3],
  ['firstaid', -21.5, -25], ['firstaid', 21.5, 25.8],
  ['energy', -9, 3], ['energy', 9, -3],
  ['energy', 0, -13], ['energy', 0, 13],
  ['frag', -3.5, -8], ['frag', 3.5, 8],
  ['smoke', -25.5, 12], ['smoke', 25.5, -12],
  ['bandage', -15, 17], ['bandage', 15, -17],
];
export const SUPPLY_SPOTS = [
  ...[-1, 1].flatMap(side => spawnKit.map((kind, i) => ({ kind, x: side * 34, y: 0.16, z: side * (i * 1.3 - 4) }))),
  ...central.map(([kind, x, z]) => ({ kind, x, y: 0.16, z })),
];

export function emptyBag() { return { bandage: 0, firstaid: 0, energy: 0, frag: 0, smoke: 0 }; }
export function freshVitals() { return { armor: null, helmet: null, boost: 0, bag: emptyBag(), using: null, regen: 0 }; }

// Slab intersection against the actual collision boxes, including glass and
// furniture. Endpoints have a small tolerance so resting on a surface is valid.
export function clearSegment(a, b, colliders, margin = 0) {
  for (const c of colliders) {
    let near = 0, far = 1;
    for (const [axis, half, i] of [['x', 'hx', 0], ['y', 'hy', 1], ['z', 'hz', 2]]) {
      const d = b[i] - a[i], lo = c[axis] - c[half] - margin, hi = c[axis] + c[half] + margin;
      if (Math.abs(d) < 1e-8) { if (a[i] < lo || a[i] > hi) { near = 2; break; } }
      else {
        let t0 = (lo - a[i]) / d, t1 = (hi - a[i]) / d;
        if (t0 > t1) [t0, t1] = [t1, t0];
        near = Math.max(near, t0); far = Math.min(far, t1);
        if (near > far) break;
      }
    }
    if (near <= far && far > 0.005 && near < 0.995) return false;
  }
  return true;
}

export function stepGrenade(g, dt, colliders, bounds) {
  const radius = 0.09;
  g.vy -= 16 * dt;
  for (const [axis, velocity, half] of [['x', 'vx', 'hx'], ['z', 'vz', 'hz'], ['y', 'vy', 'hy']]) {
    const previous = g[axis];
    g[axis] += g[velocity] * dt;
    for (const c of colliders) {
      if (Math.abs(g.x - c.x) >= c.hx + radius || Math.abs(g.y - c.y) >= c.hy + radius || Math.abs(g.z - c.z) >= c.hz + radius) continue;
      const side = Math.sign(previous - c[axis]) || -Math.sign(g[velocity]) || 1;
      g[axis] = c[axis] + side * (c[half] + radius + 0.001);
      g[velocity] *= -0.43;
      if (axis === 'y' && side > 0) { g.vx *= 0.78; g.vz *= 0.78; if (Math.abs(g.vy) < 0.75) g.vy = 0; }
    }
  }
  if (g.y < radius) {
    g.y = radius; g.vy = Math.abs(g.vy) > 0.75 ? Math.abs(g.vy) * 0.4 : 0;
    const friction = Math.pow(0.055, dt); g.vx *= friction; g.vz *= friction;
  }
  if (g.y > 3.4 - radius) { g.y = 3.4 - radius; g.vy = -Math.abs(g.vy) * 0.4; }
  for (const [axis, v, min, max] of [['x', 'vx', bounds.minX, bounds.maxX], ['z', 'vz', bounds.minZ, bounds.maxZ]]) {
    if (g[axis] < min + radius || g[axis] > max - radius) {
      g[axis] = Math.max(min + radius, Math.min(max - radius, g[axis])); g[v] *= -0.43;
    }
  }
}
