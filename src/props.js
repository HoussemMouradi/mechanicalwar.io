import * as THREE from 'three';
import { PROPS } from './config.js';
import { materials } from './textures.js';
import { StaticBatch } from './geometry.js';

export const GRAVITY = 20;
export const CEILING = 3.4;

const matCache = new Map();
function pm(key, params) {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(params));
  return matCache.get(key);
}

function part(group, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

// Meshes are centred on the prop's collision box so physics and visuals line up.
export function buildPropMesh(type, variant = 0) {
  const M = materials(), g = new THREE.Group();
  const [, hy] = PROPS[type].half;
  switch (type) {
    case 'keyboard': {
      part(g, new THREE.BoxGeometry(0.46, 0.025, 0.16), M.blackPlastic, 0, -0.005);
      const keyMat = variant % 2 ? M.greyPlastic : pm('keys', { color: 0x2a2d33, roughness: 0.6 });
      for (let r = 0; r < 5; r++) part(g, new THREE.BoxGeometry(0.42 - (r === 4 ? 0.2 : 0), 0.012, 0.022), keyMat, 0, 0.012, -0.056 + r * 0.028);
      break;
    }
    case 'mug': {
      const mugMat = pm('mug' + (variant % 4), { color: [0xf8fafc, 0xff7a1a, 0x2f8cff, 0x16a34a][variant % 4], roughness: 0.35 });
      part(g, new THREE.CylinderGeometry(0.045, 0.04, 0.11, 18), mugMat);
      part(g, new THREE.CylinderGeometry(0.04, 0.04, 0.005, 16), pm('coffee', { color: 0x3b1f0e, roughness: 0.2 }), 0, 0.048);
      part(g, new THREE.TorusGeometry(0.03, 0.008, 8, 14, Math.PI), mugMat, 0.045, 0, 0, 0, 0, -Math.PI / 2);
      break;
    }
    case 'stapler': {
      part(g, new THREE.BoxGeometry(0.18, 0.025, 0.05), M.blackPlastic, 0, -0.025);
      part(g, new THREE.BoxGeometry(0.17, 0.03, 0.045), M.red, 0, 0.012, 0, 0, 0, 0.08);
      break;
    }
    case 'phone': {
      part(g, new THREE.BoxGeometry(0.22, 0.05, 0.19), M.blackPlastic, 0, -0.01, 0, -0.15);
      part(g, new THREE.CapsuleGeometry(0.022, 0.16, 4, 8), M.blackPlastic, -0.04, 0.035, -0.02, 0, 0, Math.PI / 2);
      part(g, new THREE.BoxGeometry(0.07, 0.005, 0.05), M.screens[3], 0.05, 0.02, 0.02, -0.15);
      break;
    }
    case 'laptop': {
      part(g, new THREE.BoxGeometry(0.34, 0.018, 0.24), M.chrome, 0, -0.012, 0.02);
      const lid = new THREE.Group();
      lid.position.set(0, -0.004, -0.1);
      lid.rotation.x = -1.2;
      part(lid, new THREE.BoxGeometry(0.34, 0.012, 0.23), M.chrome, 0, 0, -0.115);
      part(lid, new THREE.PlaneGeometry(0.31, 0.2), M.screens[variant % 6], 0, 0.0075, -0.115, -Math.PI / 2);
      g.add(lid);
      break;
    }
    case 'monitor': {
      part(g, new THREE.BoxGeometry(0.6, 0.36, 0.03), M.blackPlastic, 0, 0.06, 0);
      part(g, new THREE.PlaneGeometry(0.57, 0.33), M.screens[variant % 6], 0, 0.06, 0.0155);
      part(g, new THREE.BoxGeometry(0.05, 0.16, 0.04), M.darkMetal, 0, -0.14, -0.035);
      part(g, new THREE.BoxGeometry(0.24, 0.015, 0.18), M.darkMetal, 0, -0.232, -0.02);
      break;
    }
    case 'extinguisher': {
      const red = pm('extRed', { color: 0xc81e1e, roughness: 0.3, metalness: 0.3 });
      part(g, new THREE.CylinderGeometry(0.085, 0.085, 0.48, 18), red, 0, -0.05);
      part(g, new THREE.SphereGeometry(0.085, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0, 0.19);
      part(g, new THREE.CylinderGeometry(0.025, 0.03, 0.06, 10), M.chrome, 0, 0.29);
      part(g, new THREE.BoxGeometry(0.12, 0.015, 0.03), M.darkMetal, 0.04, 0.3);
      part(g, new THREE.CylinderGeometry(0.012, 0.012, 0.32, 8), M.blackPlastic, 0.09, 0.08, 0, 0, 0, 0.12);
      break;
    }
    case 'plant': {
      part(g, new THREE.CylinderGeometry(0.17, 0.13, 0.32, 16), M.plantPot, 0, -hy + 0.16);
      part(g, new THREE.CylinderGeometry(0.155, 0.155, 0.02, 16), pm('soil', { color: 0x3b2a1c, roughness: 1 }), 0, -hy + 0.31);
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * Math.PI * 2;
        const leaf = part(g, new THREE.PlaneGeometry(0.12, 0.42), i % 2 ? M.leaf : M.leafDark, Math.cos(a) * 0.07, -hy + 0.5, Math.sin(a) * 0.07, 0, -a, 0);
        leaf.rotation.x = 0.35 * Math.sin(a * 2);
        leaf.rotation.z = Math.cos(a) * 0.45;
      }
      break;
    }
    case 'bin': {
      const bin = pm('bin', { color: 0x3f4650, roughness: 0.5, metalness: 0.6, side: THREE.DoubleSide });
      part(g, new THREE.CylinderGeometry(0.17, 0.14, 0.4, 20, 1, true), bin);
      part(g, new THREE.CircleGeometry(0.14, 20), bin, 0, -0.195, 0, -Math.PI / 2);
      part(g, new THREE.SphereGeometry(0.07, 8, 6), M.whitePlastic, 0.03, 0.1, 0.02);
      break;
    }
    case 'chair': {
      const seat = variant % 2 ? M.fabricBlue : M.fabricOrange;
      part(g, new THREE.BoxGeometry(0.5, 0.08, 0.48), seat, 0, -0.03, 0);
      part(g, new THREE.BoxGeometry(0.48, 0.52, 0.07), seat, 0, 0.26, 0.23, -0.1);
      part(g, new THREE.CylinderGeometry(0.025, 0.025, 0.28, 10), M.chrome, 0, -0.2);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        part(g, new THREE.BoxGeometry(0.3, 0.03, 0.04), M.blackPlastic, Math.cos(a) * 0.14, -0.4, Math.sin(a) * 0.14, 0, -a, 0);
        part(g, new THREE.SphereGeometry(0.035, 8, 6), M.blackPlastic, Math.cos(a) * 0.28, -0.46, Math.sin(a) * 0.28);
      }
      for (const s of [-1, 1]) part(g, new THREE.BoxGeometry(0.04, 0.03, 0.3), M.blackPlastic, s * 0.27, 0.12, 0.02);
      break;
    }
    case 'printer': {
      part(g, new THREE.BoxGeometry(0.58, 0.3, 0.48), M.whitePlastic, 0, -0.05);
      part(g, new THREE.BoxGeometry(0.58, 0.08, 0.48), M.greyPlastic, 0, 0.14);
      part(g, new THREE.BoxGeometry(0.4, 0.01, 0.2), pm('paper', { color: 0xffffff, roughness: 0.9 }), 0, 0.185, -0.08);
      part(g, new THREE.BoxGeometry(0.1, 0.05, 0.005), M.screens[2], 0.18, 0.14, 0.241);
      break;
    }
  }
  return g;
}

// Merges a prop's parts into one mesh per material to keep draw calls low.
export function compactProp(group) {
  const batch = new StaticBatch(), out = new THREE.Group();
  group.updateMatrixWorld(true);
  group.traverse(o => { if (o.isMesh) batch.add(o.geometry, o.material, o.matrixWorld); });
  for (const m of batch.build(out)) m.matrixAutoUpdate = true;
  return out;
}

function overlapsBox(px, py, pz, hx, hy, hz, b) {
  return Math.abs(px - b.x) < hx + b.hx && Math.abs(py - b.y) < hy + b.hy && Math.abs(pz - b.z) < hz + b.hz;
}

// Axis-separated AABB physics. Props tumble visually but collide as upright boxes.
export function stepProp(p, dt, colliders, bounds) {
  const [hx0, hy, hz0] = PROPS[p.type].half;
  const hr = Math.max(hx0, hz0);
  let grounded = false;
  p.vy -= GRAVITY * dt;

  p.x += p.vx * dt;
  for (const b of colliders) {
    if (b.noProps || !overlapsBox(p.x, p.y, p.z, hr, hy, hr, b)) continue;
    p.x = b.x + Math.sign(p.x - b.x || 1) * (b.hx + hr + 0.001);
    p.vx *= -0.35; p.vz *= 0.8;
    p.bounced = true;
  }
  p.z += p.vz * dt;
  for (const b of colliders) {
    if (b.noProps || !overlapsBox(p.x, p.y, p.z, hr, hy, hr, b)) continue;
    p.z = b.z + Math.sign(p.z - b.z || 1) * (b.hz + hr + 0.001);
    p.vz *= -0.35; p.vx *= 0.8;
    p.bounced = true;
  }
  p.y += p.vy * dt;
  for (const b of colliders) {
    if (b.noProps || !overlapsBox(p.x, p.y, p.z, hr, hy, hr, b)) continue;
    if (p.vy <= 0 && p.y > b.y) { p.y = b.y + b.hy + hy; grounded = true; }
    else { p.y = b.y - b.hy - hy - 0.001; }
    p.vy = Math.abs(p.vy) > 2.5 ? -p.vy * 0.28 : 0;
  }
  if (p.y - hy <= 0) {
    p.y = hy;
    p.vy = Math.abs(p.vy) > 2.5 ? -p.vy * 0.28 : 0;
    grounded = true;
  }
  if (p.y + hy > CEILING) { p.y = CEILING - hy; p.vy = -Math.abs(p.vy) * 0.3; }
  p.x = Math.max(bounds.minX + hr, Math.min(bounds.maxX - hr, p.x));
  p.z = Math.max(bounds.minZ + hr, Math.min(bounds.maxZ - hr, p.z));

  if (grounded) {
    const f = Math.pow(0.02, dt);
    p.vx *= f; p.vz *= f;
    p.spin *= f;
  }
  p.rx += p.spin * dt;
  p.rz += p.spin * 0.6 * dt;
  if (grounded && Math.hypot(p.vx, p.vy, p.vz) < 0.5) {
    p.vx = p.vy = p.vz = 0;
    p.spin = 0; p.rx = 0; p.rz = 0;
    return true;
  }
  return false;
}
