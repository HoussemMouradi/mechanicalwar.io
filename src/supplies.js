import * as THREE from 'three';

const PALETTE = { vest1: 0x869367, vest2: 0x5fa0c7, helmet: 0x80927b, bandage: 0xe6d9b8, firstaid: 0x63bba0, energy: 0xe7ae4b, frag: 0xbd9963, smoke: 0xaebfcd };
const material = (color, roughness = 0.72, metalness = 0.05) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function box(parent, size, pos, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...pos); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function cylinder(parent, radius, height, pos, mat, top = radius) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(top, radius, height, 12), mat);
  m.position.set(...pos); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}

/** Original, inexpensive models: recognizable equipment rather than colored placeholder cubes. */
export function buildSupply(kind, { marker = true } = {}) {
  const g = new THREE.Group();
  const fabric = material(PALETTE[kind] ?? 0x87917c), dark = material(0x272e2e), metal = material(0x838b89, 0.32, 0.65);
  if (kind === 'vest1' || kind === 'vest2') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.23, -0.27); shape.lineTo(0.23, -0.27); shape.lineTo(0.26, 0.12);
    shape.lineTo(0.16, 0.3); shape.lineTo(0.085, 0.3); shape.lineTo(0.07, 0.18);
    shape.lineTo(-0.07, 0.18); shape.lineTo(-0.085, 0.3); shape.lineTo(-0.16, 0.3); shape.lineTo(-0.26, 0.12); shape.closePath();
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.085, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.012, bevelSegments: 1, steps: 1 }), fabric);
    body.rotation.x = -Math.PI / 2; body.position.y = 0.025; body.castShadow = body.receiveShadow = true; g.add(body);
    box(g, [0.3, 0.025, 0.24], [0, 0.15, 0.02], dark);
    for (let i = -1; i <= 1; i++) {
      box(g, [0.095, 0.055, 0.13], [i * 0.108, 0.16, 0.14], fabric);
      box(g, [0.082, 0.009, 0.016], [i * 0.108, 0.19, 0.12], dark);
    }
    for (const x of [-0.2, 0.2]) box(g, [0.07, 0.035, 0.095], [x, 0.12, -0.2], dark);
    box(g, [0.07, 0.014, 0.03], [0, 0.17, -0.025], metal);
    if (kind === 'vest2') for (const x of [-0.036, 0.036]) box(g, [0.018, 0.008, 0.04], [x, 0.177, -0.08], material(0xaedcf2));
  } else if (kind === 'helmet') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), fabric);
    dome.scale.z = 1.12; dome.position.y = 0.055; dome.castShadow = true; g.add(dome);
    cylinder(g, 0.213, 0.025, [0, 0.055, 0], dark).scale.z = 1.12;
    box(g, [0.12, 0.04, 0.025], [0, 0.1, -0.222], dark);
    box(g, [0.055, 0.055, 0.017], [0, 0.115, -0.242], metal);
  } else if (kind === 'energy') {
    cylinder(g, 0.072, 0.22, [0, 0.115, 0], fabric);
    cylinder(g, 0.073, 0.012, [0, 0.23, 0], metal);
    cylinder(g, 0.073, 0.012, [0, 0.009, 0], metal);
    cylinder(g, 0.074, 0.064, [0, 0.13, 0], dark);
    box(g, [0.025, 0.045, 0.006], [0, 0.14, -0.074], material(0xf9df94));
    box(g, [0.024, 0.005, 0.04], [0, 0.24, 0.005], dark);
  } else if (kind === 'bandage') {
    const white = material(0xe8e5d9);
    for (const x of [-0.067, 0.067]) {
      const roll = cylinder(g, 0.067, 0.16, [x, 0.075, 0], white);
      roll.rotation.x = Math.PI / 2;
      const core = cylinder(g, 0.025, 0.162, [x, 0.075, 0], dark); core.rotation.x = Math.PI / 2;
    }
    box(g, [0.26, 0.016, 0.055], [0, 0.135, 0], fabric);
    box(g, [0.016, 0.007, 0.04], [0, 0.147, 0], material(0xa95145));
  } else if (kind === 'firstaid') {
    box(g, [0.35, 0.13, 0.25], [0, 0.07, 0], fabric);
    box(g, [0.36, 0.025, 0.26], [0, 0.15, 0], dark);
    box(g, [0.15, 0.012, 0.05], [0, 0.17, 0], material(0xf3f1e3));
    box(g, [0.05, 0.013, 0.15], [0, 0.17, 0], material(0xf3f1e3));
    for (const x of [-0.09, 0.09]) box(g, [0.028, 0.04, 0.018], [x, 0.145, -0.132], metal);
    box(g, [0.14, 0.02, 0.025], [0, 0.06, -0.16], dark);
  } else if (kind === 'frag') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), fabric);
    body.position.y = 0.11; body.scale.y = 1.15; body.castShadow = true; g.add(body);
    for (const y of [0.067, 0.11, 0.153]) cylinder(g, 0.088, 0.01, [0, y, 0], dark);
    cylinder(g, 0.028, 0.06, [0, 0.22, 0], dark);
    box(g, [0.036, 0.022, 0.15], [0, 0.255, 0.04], metal).rotation.x = 0.16;
  } else if (kind === 'smoke') {
    cylinder(g, 0.065, 0.235, [0, 0.125, 0], fabric);
    cylinder(g, 0.067, 0.035, [0, 0.15, 0], dark);
    cylinder(g, 0.045, 0.035, [0, 0.26, 0], metal);
    box(g, [0.03, 0.018, 0.12], [0, 0.281, 0.025], dark);
  }
  if (marker) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.34, 32), new THREE.MeshBasicMaterial({ color: PALETTE[kind], transparent: true, opacity: 0.46, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.008; g.add(ring); g.userData.ring = ring;
  }
  // Unused materials do not belong to the scene and must not be leaked.
  const used = new Set(); g.traverse(o => { if (o.material) used.add(o.material); });
  for (const mat of [fabric, dark, metal]) if (!used.has(mat)) mat.dispose();
  return g;
}

export function disposeSupply(object) {
  object.removeFromParent();
  const geometries = new Set(), materials = new Set();
  object.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) m.dispose();
}

/** Clouds are finite host-timed volumes; no global fog state is changed. */
export class SmokeEffects {
  constructor(scene) { this.scene = scene; this.clouds = new Map(); }

  add(id, p, radius = 4, duration = 16) {
    const existing = this.clouds.get(id);
    if (existing) { existing.remaining = duration; return; }
    const center = new THREE.Vector3(...p); center.y += radius * 0.28;
    // Every host cloud keeps its own lifetime and occlusion state. Rendering has
    // a separate budget, so a full snapshot never evicts/restarts mature smoke.
    this.clouds.set(id, { group: null, center, radius, remaining: duration, duration, age: 0, density: 0 });
  }

  createVisual(c) {
    const group = new THREE.Group(), radius = c.radius;
    group.position.copy(c.center);
    const geometry = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 15; i++) {
      const a = i * 2.399963, r = i ? radius * 0.52 * Math.sqrt(i / 14) : 0;
      const mat = new THREE.MeshStandardMaterial({ color: i % 3 === 0 ? 0xa4aba9 : 0x929b98, transparent: true, opacity: 0, roughness: 1, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.set(Math.cos(a) * r, Math.sin(i * 1.7) * radius * 0.2, Math.sin(a) * r);
      mesh.scale.setScalar(radius * (i ? 0.48 : 0.64)); group.add(mesh);
    }
    this.scene.add(group); c.group = group;
  }

  remove(id) {
    const c = this.clouds.get(id);
    if (!c) return;
    if (c.group) disposeSupply(c.group);
    this.clouds.delete(id);
  }
  clear() { for (const id of [...this.clouds.keys()]) this.remove(id); }

  update(dt, camera) {
    let inside = 0;
    for (const [id, c] of this.clouds) {
      c.remaining -= dt; c.age += dt;
      if (c.remaining <= 0) { this.remove(id); continue; }
      c.density = Math.min(1, c.age / 0.75, c.remaining / 1.4);
      const d = camera.position.distanceTo(c.center);
      inside = Math.max(inside, Math.max(0, 1 - d / c.radius) * c.density);
    }
    // Render the nearest twelve volumes. A small incumbent bias avoids visual
    // allocation churn when the camera rests near a distance-order boundary.
    const ranked = [...this.clouds.values()].map(c => ({ c,
      priority: camera.position.distanceToSquared(c.center) - (c.group ? c.radius * c.radius * 0.15 : 0),
    })).sort((a, b) => a.priority - b.priority);
    const visual = new Set(ranked.slice(0, 12).map(({ c }) => c));
    for (const c of this.clouds.values()) {
      if (!visual.has(c)) {
        if (c.group) { disposeSupply(c.group); c.group = null; }
        continue;
      }
      if (!c.group) this.createVisual(c);
      c.group.scale.setScalar(0.65 + 0.35 * Math.min(1, c.age / 1.2));
      c.group.children.forEach((m, i) => {
        m.material.opacity = c.density * (i ? 0.34 : 0.72);
        m.rotation.y += dt * (i % 2 ? 0.025 : -0.035);
      });
    }
    return Math.min(0.98, inside * 2.6);
  }

  obscures(from, to) {
    const dir = new THREE.Vector3().subVectors(to, from), length = dir.length();
    if (length < 0.001) return false;
    dir.divideScalar(length);
    for (const c of this.clouds.values()) {
      if ((c.density ?? 0) < 0.3) continue;
      const delta = new THREE.Vector3().subVectors(c.center, from);
      const along = delta.dot(dir), halfSquared = c.radius * c.radius - (delta.lengthSq() - along * along);
      if (halfSquared < 0) continue;
      const half = Math.sqrt(halfSquared);
      const inside = Math.min(length, along + half) - Math.max(0, along - half);
      if (inside * c.density > 0.85) return true;
    }
    return false;
  }
}
