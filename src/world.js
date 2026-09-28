import * as THREE from 'three';
import { materials } from './textures.js';
import { StaticBatch, boxGeo, planeGeo, trs } from './geometry.js';
import { buildPropMesh } from './props.js';
import { PROPS } from './config.js';

export const WALL_H = 3.4;
const DOOR_H = 2.3;
export const BOUNDS = { minX: -40, maxX: 40, minZ: -28, maxZ: 28 };

// Layout (top view, +x east, +z south):
//   west  x<-28 : AUTO spawn (automotive garage)      east x>28 : DJB spawn
//   north z<-15 : conference room | reception | CEO office
//   middle      : open-plan desks, pillars, cover
//   south z>15  : kitchen | print room | server room
export function buildWorld(scene, quality) {
  const M = materials();
  const batch = new StaticBatch();
  const colliders = [], radar = [], gunSpots = [], propSpots = [];
  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  const frost = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
  const carpetBlue = M.carpet.clone(); carpetBlue.color = new THREE.Color(0x9fb8e8); carpetBlue.userData.meters = 2;
  const carpetWarm = M.carpet.clone(); carpetWarm.color = new THREE.Color(0xd8c4b0); carpetWarm.userData.meters = 2;
  const stone = new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.25 });
  const tv = new THREE.MeshStandardMaterial({ map: M.screens[2].map, emissiveMap: M.screens[2].map, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.2 });
  const vend = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fd7ff, emissiveIntensity: 0.9, roughness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const carPaint = new THREE.MeshPhysicalMaterial({ color: 0xd9480f, roughness: 0.3, metalness: 0.6, clearcoat: 1, clearcoatRoughness: 0.1 });
  const cardboard = new THREE.MeshStandardMaterial({ color: 0xb08850, roughness: 0.95 });
  const bookMats = [0x7f1d1d, 0x1e3a8a, 0x14532d, 0x78350f, 0x334155, 0xa16207].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));

  function collider(x, y, z, hx, hy, hz, opts = {}) {
    colliders.push({ x, y, z, hx, hy, hz, ...opts });
    if (opts.radar !== false) radar.push({ x, z, hx, hz, tall: y + hy > 1.6, glass: !!opts.glass });
  }

  // Box with bottom at y0; textures tile in world space.
  function solid(x, y0, z, w, h, d, mat, opts = {}) {
    batch.add(boxGeo(w, h, d, mat.userData.meters || 0), mat, trs(x, y0 + h / 2, z, 0, opts.ry || 0, 0), { cast: opts.cast !== false });
    if (opts.collide !== false) collider(x, y0 + h / 2, z, w / 2, h / 2, d / 2, opts);
  }

  function deco(geo, mat, matrix, cast = true) { batch.add(geo, mat, matrix, { cast }); }

  // Stamps a prop-style group as static scenery (no physics).
  function stamp(group, x, y, z, ry = 0) {
    group.position.set(x, y, z);
    group.rotation.y = ry;
    group.updateMatrixWorld(true);
    group.traverse(o => { if (o.isMesh) batch.add(o.geometry, o.material, o.matrixWorld); });
  }

  function prop(type, x, surfaceY, z, ry = 0, variant = 0) {
    propSpots.push({ type, x, y: surfaceY + PROPS[type].half[1], z, ry, variant });
  }

  function gun(type, x, surfaceY, z) { gunSpots.push({ type, x, y: surfaceY + 0.06, z }); }

  function segments(from, to, gaps) {
    const out = [];
    let cur = from;
    for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
      if (a > cur) out.push({ a: cur, b: a, gap: false });
      out.push({ a, b, gap: true });
      cur = b;
    }
    if (cur < to) out.push({ a: cur, b: to, gap: false });
    return out;
  }

  // axis 'x': wall runs along x at z=fixed. axis 'z': runs along z at x=fixed.
  function wall(axis, fixed, from, to, gaps = [], mat = M.drywall, t = 0.2) {
    for (const s of segments(from, to, gaps)) {
      const len = s.b - s.a, mid = (s.a + s.b) / 2;
      const px = axis === 'x' ? mid : fixed, pz = axis === 'x' ? fixed : mid;
      const w = axis === 'x' ? len : t, d = axis === 'x' ? t : len;
      if (s.gap) {
        solid(px, DOOR_H, pz, w, WALL_H - DOOR_H, d, mat, { radar: false });
        for (const e of [s.a, s.b]) {
          const fx = axis === 'x' ? e : fixed, fz = axis === 'x' ? fixed : e;
          solid(fx, 0, fz, axis === 'x' ? 0.06 : t + 0.05, DOOR_H, axis === 'x' ? t + 0.05 : 0.06, M.frame, { collide: false });
        }
        solid(px, DOOR_H - 0.06, pz, axis === 'x' ? len : t + 0.05, 0.06, axis === 'x' ? t + 0.05 : len, M.frame, { collide: false });
      } else {
        solid(px, 0, pz, w, WALL_H, d, mat);
        solid(px, 0, pz, axis === 'x' ? len : t + 0.03, 0.1, axis === 'x' ? t + 0.03 : len, M.baseboard, { collide: false, cast: false });
      }
    }
  }

  function glassWall(axis, fixed, from, to, gaps = []) {
    for (const s of segments(from, to, gaps)) {
      const len = s.b - s.a, mid = (s.a + s.b) / 2;
      const px = axis === 'x' ? mid : fixed, pz = axis === 'x' ? fixed : mid;
      const W = v => (axis === 'x' ? v : 0.08), D = v => (axis === 'x' ? 0.08 : v);
      if (s.gap) {
        solid(px, DOOR_H, pz, W(len), WALL_H - DOOR_H, D(len), M.drywall, { radar: false });
        continue;
      }
      solid(px, 0, pz, W(len), 0.1, D(len), M.frame, { collide: false });
      solid(px, WALL_H - 0.12, pz, W(len), 0.12, D(len), M.frame, { collide: false });
      batch.add(boxGeo(W(len) - (axis === 'x' ? 0 : 0.06), WALL_H - 0.22, D(len) - (axis === 'x' ? 0.06 : 0)), M.glass, trs(px, WALL_H / 2 - 0.01, pz), { cast: false, receive: false });
      batch.add(boxGeo(axis === 'x' ? len : 0.085, 0.3, axis === 'x' ? 0.085 : len), frost, trs(px, 1.25, pz), { cast: false, receive: false });
      const n = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i <= n; i++) {
        const e = s.a + (len * i) / n;
        solid(axis === 'x' ? e : fixed, 0, axis === 'x' ? fixed : e, axis === 'x' ? 0.05 : 0.1, WALL_H, axis === 'x' ? 0.1 : 0.05, M.frame, { collide: false });
      }
      collider(px, WALL_H / 2, pz, W(len) / 2, WALL_H / 2, D(len) / 2, { glass: true });
    }
  }

  // Exterior wall along x with a band of windows and a city view behind it.
  function windowWall(z, from, to, inward) {
    const len = to - from, mid = (from + to) / 2;
    solid(mid, 0, z, len, 0.95, 0.3, M.drywall, { collide: false });
    solid(mid, 2.75, z, len, WALL_H - 2.75, 0.3, M.drywall, { collide: false });
    solid(mid, 0.93, z + inward * 0.2, len, 0.05, 0.22, stone, { radar: false });
    batch.add(boxGeo(len, 1.8, 0.02), M.glass, trs(mid, 1.85, z), { cast: false, receive: false });
    for (let x = from; x <= to + 0.01; x += 2.5) solid(x, 0.95, z, 0.09, 1.8, 0.16, M.frame, { collide: false });
    solid(mid, 0, z + inward * 0.16, len, 0.1, 0.03, M.baseboard, { collide: false, cast: false });
    collider(mid, WALL_H / 2, z, len / 2, WALL_H / 2, 0.15);
  }

  /* ---------- shell ---------- */
  const W = BOUNDS.maxX - BOUNDS.minX, D = BOUNDS.maxZ - BOUNDS.minZ;
  deco(planeGeo(W, D, 2), M.carpet, trs(0, 0, 0, -Math.PI / 2), false);
  batch.add(planeGeo(W, D, 1.2), M.ceiling, trs(0, WALL_H, 0, Math.PI / 2), { cast: true, receive: true });
  const floorPatch = (x0, x1, z0, z1, mat) => deco(planeGeo(x1 - x0, z1 - z0, mat.userData.meters), mat, trs((x0 + x1) / 2, 0.004, (z0 + z1) / 2, -Math.PI / 2), false);
  floorPatch(-40, -28, -28, 28, M.concrete);
  floorPatch(28, 40, -28, 28, carpetBlue);
  floorPatch(-24, -6, 15, 28, M.tiles);
  floorPatch(6, 24, 15, 28, M.concrete);
  floorPatch(-6, 6, -28, -15, M.wood);
  floorPatch(6, 24, -28, -15, carpetWarm);

  windowWall(BOUNDS.minZ, BOUNDS.minX, BOUNDS.maxX, 1);
  windowWall(BOUNDS.maxZ, BOUNDS.minX, BOUNDS.maxX, -1);
  wall('z', BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxZ, [], M.drywall, 0.3);
  wall('z', BOUNDS.maxX, BOUNDS.minZ, BOUNDS.maxZ, [], M.drywall, 0.3);

  const cityMat = M.city;
  for (const [z, ry] of [[-70, 0], [70, Math.PI]]) deco(new THREE.PlaneGeometry(260, 65), cityMat, trs(0, -8, z, 0, ry), false);
  for (const [x, ry] of [[-90, Math.PI / 2], [90, -Math.PI / 2]]) deco(new THREE.PlaneGeometry(200, 65), cityMat, trs(x, -8, 0, 0, ry), false);

  /* ---------- spawn walls ---------- */
  const spawnGaps = [[-19, -15.5], [-2.5, 2.5], [15.5, 19]];
  wall('z', -28, BOUNDS.minZ, BOUNDS.maxZ, spawnGaps);
  wall('z', 28, BOUNDS.minZ, BOUNDS.maxZ, spawnGaps);
  solid(-28.12, 0.1, 0, 0.05, 0.25, 56, M.orangeTrim, { collide: false });
  solid(28.12, 0.1, 0, 0.05, 0.25, 56, M.blueTrim, { collide: false });
  deco(new THREE.PlaneGeometry(9, 2.25), M.logoAuto, trs(-39.83, 2.1, 0, 0, Math.PI / 2), false);
  deco(new THREE.PlaneGeometry(6, 2.25), M.logoDjb, trs(39.83, 2.1, 0, 0, -Math.PI / 2), false);
  deco(new THREE.PlaneGeometry(6, 1.5), M.logoAuto, trs(-28.12, 2.75, 9, 0, -Math.PI / 2), false);
  deco(new THREE.PlaneGeometry(3.6, 1.35), M.logoDjb, trs(28.12, 2.75, -9, 0, Math.PI / 2), false);

  /* ---------- north rooms ---------- */
  wall('z', -24, -28, -15, [[-24, -21]]);
  wall('z', -6, -28, -15, [[-20, -17.5]]);
  glassWall('x', -15, -24, -6, [[-21.5, -19.3], [-10.7, -8.5]]);
  wall('z', 6, -28, -15, [[-20, -17.5]]);
  wall('z', 24, -28, -15, [[-24, -21]]);
  glassWall('x', -15, 6, 24, [[8.5, 10.7], [19.3, 21.5]]);

  // Conference room
  solid(-15, 0.72, -21.5, 9, 0.05, 2.4, M.darkWood);
  solid(-15, 0, -21.5, 7.6, 0.72, 1.2, M.darkMetal, { collide: false });
  collider(-15, 0.385, -21.5, 4.5, 0.385, 1.2);
  [-18.3, -16.1, -13.9, -11.7].forEach((x, i) => {
    prop('chair', x, 0, -23.1, 0, i);
    prop('chair', x, 0, -19.9, Math.PI, i + 1);
  });
  prop('laptop', -17, 0.77, -21.8, 0.2, 1);
  prop('laptop', -12.5, 0.77, -21.2, Math.PI - 0.3, 4);
  prop('mug', -14.2, 0.77, -21.9, 0, 2);
  prop('mug', -15.8, 0.77, -21.1, 0, 0);
  gun('m4a4', -15, 0.77, -21.5);
  solid(-23.84, 1.1, -21.5, 0.06, 1.4, 2.5, M.blackPlastic, { collide: false });
  deco(new THREE.PlaneGeometry(2.4, 1.32), tv, trs(-23.8, 1.8, -21.5, 0, Math.PI / 2), false);
  deco(new THREE.PlaneGeometry(3, 1.5), M.whiteboard, trs(-6.12, 1.6, -22, 0, -Math.PI / 2), false);
  prop('plant', -23.3, 0, -27.3);

  // Reception / lobby
  solid(0, 0, -20.6, 6, 1.05, 0.5, M.darkWood);
  solid(0, 1.05, -20.6, 6.3, 0.05, 0.8, stone, { radar: false });
  solid(-3.2, 0, -21.8, 0.5, 1.05, 2.4, M.darkWood);
  solid(3.2, 0, -21.8, 0.5, 1.05, 2.4, M.darkWood);
  solid(0, 0, -21.6, 5.9, 0.75, 0.7, M.wood, { radar: false });
  stamp(buildPropMesh('monitor', 5), -1.2, 0.99, -21.7, Math.PI);
  stamp(buildPropMesh('monitor', 4), 1.2, 0.99, -21.7, Math.PI);
  gun('rpg', 0, 1.1, -20.6);
  prop('phone', 2.2, 1.1, -20.5, 0.3);
  prop('stapler', -2, 1.1, -20.6, -0.4);
  solid(0, 0, -26.2, 8, WALL_H, 0.3, M.accentWall);
  deco(new THREE.PlaneGeometry(7, 1.2), M.logoAuto, trs(-1.8, 2.3, -26.04, 0, 0, 0, [0.5, 0.8, 1]), false);
  deco(new THREE.PlaneGeometry(4, 1.5), M.logoDjb, trs(2.2, 2.3, -26.04, 0, 0, 0, [0.5, 0.8, 1]), false);
  for (const x of [-4.2, 4.2]) { solid(x, 0, -16.6, 1.8, 0.45, 0.8, M.leather); solid(x, 0.45, -16.25, 1.8, 0.45, 0.12, M.leather, { radar: false }); }
  prop('plant', -5.4, 0, -25.4, 0, 1);
  prop('plant', 5.4, 0, -25.4, 0, 2);

  // CEO office
  solid(15, 0.72, -22, 2.8, 0.06, 1.1, M.darkWood);
  solid(15, 0, -21.5, 2.8, 0.72, 0.08, M.darkWood, { collide: false });
  solid(13.7, 0, -22, 0.08, 0.72, 1.1, M.darkWood, { collide: false });
  solid(16.3, 0, -22, 0.08, 0.72, 1.1, M.darkWood, { collide: false });
  colliders.push({ x: 15, y: 0.39, z: -22, hx: 1.4, hy: 0.39, hz: 0.55 });
  radar.push({ x: 15, z: -22, hx: 1.4, hz: 0.55, tall: false });
  gun('awp', 15, 0.78, -22);
  prop('laptop', 14.2, 0.78, -22.1, Math.PI, 3);
  prop('phone', 16.1, 0.78, -22.2, Math.PI);
  prop('chair', 15, 0, -23.3, 0, 0);
  for (let z = -27.2; z <= -16; z += 1.1) {
    solid(23.7, 0, z, 0.4, 2.2, 1.0, M.darkWood, { collide: false });
    for (let shelf = 0; shelf < 4; shelf++) {
      let cz = z - 0.42;
      while (cz < z + 0.4) {
        const w = 0.05 + ((cz * 97 + shelf * 13) % 1 + 1) % 1 * 0.05;
        deco(boxGeo(0.28, 0.3 + (shelf % 2) * 0.05, w), bookMats[Math.abs(Math.floor(cz * 31 + shelf * 7)) % 6], trs(23.62, 0.2 + shelf * 0.52 + 0.16, cz + w / 2));
        cz += w + 0.008;
      }
    }
  }
  collider(23.7, 1.1, -21.6, 0.2, 1.1, 5.8);
  solid(8.2, 0, -21, 0.9, 0.45, 2.2, M.leather);
  solid(7.85, 0.45, -21, 0.15, 0.45, 2.2, M.leather, { radar: false });
  solid(9.8, 0, -21, 0.7, 0.42, 1.2, M.darkWood);
  prop('mug', 9.8, 0.42, -21.2, 0, 3);
  prop('plant', 6.7, 0, -27.3, 0, 3);
  prop('plant', 22.9, 0, -15.7, 0, 4);
  deco(new THREE.PlaneGeometry(1.1, 1.55), M.posters[0], trs(6.12, 1.7, -24, 0, Math.PI / 2), false);

  /* ---------- south rooms ---------- */
  wall('z', -24, 15, 28, [[21, 24]]);
  wall('z', -6, 15, 28, [[17.5, 20]]);
  wall('x', 15, -24, -6, [[-21, -18.5], [-11, -8.5]]);
  wall('z', 6, 15, 28, [[17.5, 20]]);
  wall('z', 24, 15, 28, [[21, 24]]);
  wall('x', 15, 6, 24, [[8.5, 11], [18.5, 21]]);

  // Kitchen
  solid(-17, 0, 27.35, 10, 0.88, 0.65, M.darkWood);
  solid(-17, 0.88, 27.35, 10.1, 0.05, 0.7, stone, { radar: false });
  solid(-15, 0.9, 27.35, 0.9, 0.04, 0.5, M.chrome, { collide: false });
  solid(-20, 0.93, 27.4, 0.5, 0.35, 0.4, M.blackPlastic);
  solid(-20, 1.28, 27.4, 0.5, 0.05, 0.4, M.chrome, { collide: false });
  solid(-12.5, 0.93, 27.4, 0.6, 0.35, 0.42, M.whitePlastic);
  solid(-12.5, 1.0, 27.19, 0.36, 0.22, 0.01, M.blackPlastic, { collide: false });
  solid(-23.3, 0, 16.2, 0.9, 1.95, 0.85, M.chrome);
  solid(-22.84, 0.9, 16.2, 0.02, 0.9, 0.05, M.darkMetal, { collide: false });
  solid(-7, 0, 27.1, 1.1, 1.95, 0.9, M.darkMetal);
  solid(-7, 0.35, 26.64, 0.9, 1.4, 0.02, vend, { collide: false });
  solid(-15, 0.73, 21.5, 4.2, 0.05, 1.1, M.wood);
  solid(-15, 0, 21.5, 3.6, 0.73, 0.1, M.darkMetal, { collide: false });
  colliders.push({ x: -15, y: 0.39, z: 21.5, hx: 2.1, hy: 0.39, hz: 0.55 });
  radar.push({ x: -15, z: 21.5, hx: 2.1, hz: 0.55, tall: false });
  for (const x of [-16.5, -15, -13.5]) for (const z of [20.5, 22.5]) {
    deco(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16), M.fabricOrange, trs(x, 0.62, z));
    deco(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), M.chrome, trs(x, 0.3, z));
    deco(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16), M.chrome, trs(x, 0.01, z));
  }
  gun('awp', -15, 0.78, 21.5);
  prop('mug', -18.5, 0.93, 27.3, 0, 1);
  prop('mug', -18, 0.93, 27.2, 0, 2);
  prop('mug', -14.2, 0.78, 21.2, 0, 3);
  prop('extinguisher', -23.6, 0, 18.3);
  prop('bin', -9.8, 0, 27.3);
  prop('bin', -8.3, 0, 16);
  deco(new THREE.PlaneGeometry(1.1, 1.55), M.posters[3], trs(-6.12, 1.7, 24.5, 0, -Math.PI / 2), false);

  // Print room
  solid(-4.4, 0, 26.9, 1.4, 1.1, 0.8, M.whitePlastic);
  solid(-4.4, 1.1, 26.9, 1.4, 0.12, 0.8, M.greyPlastic, { radar: false });
  solid(-4.4, 0.9, 26.49, 0.3, 0.12, 0.01, M.screens[3], { collide: false });
  for (const z of [17.5, 20.5, 23.5]) {
    solid(5.5, 0, z, 0.5, 1.9, 2.4, M.darkMetal, { collide: true });
    for (let s = 0; s < 3; s++) deco(boxGeo(0.4, 0.28, 0.35), cardboard, trs(5.5, 0.35 + s * 0.6, z - 0.7 + (s % 2) * 0.5));
  }
  for (let z = 17; z < 25; z += 0.5) solid(-5.6, 0, z, 0.5, 1.95, 0.48, z % 1 === 0 ? M.frame : M.darkMetal, { collide: false });
  collider(-5.6, 0.975, 20.75, 0.25, 0.975, 4.1);
  solid(1.5, 0, 26.9, 1.2, 0.75, 0.7, M.wood);
  prop('printer', 1.5, 0.75, 26.9, 0);
  prop('stapler', 0.7, 0.75, 26.9, 0.5);
  prop('printer', -2, 0, 20.5, 0.4);
  gun('nova', 0, 0, 22);

  // Server room
  for (const z of [18.2, 21.5, 24.8]) {
    for (const [x0, n] of [[8.2, 4], [15.5, 4]]) {
      const len = n * 0.62;
      const cx = x0 + len / 2;
      solid(cx, 0, z, len, 2.1, 1.0, M.darkMetal);
      for (const side of [-1, 1]) {
        for (let i = 0; i < n; i++) deco(new THREE.PlaneGeometry(0.56, 2.0), M.rack, trs(x0 + 0.31 + i * 0.62, 1.05, z + side * 0.505, 0, side > 0 ? 0 : Math.PI), false);
      }
      solid(cx, 2.1, z, len, 0.05, 1.05, M.frame, { collide: false });
    }
  }
  for (let x = 7; x < 24; x += 2) solid(x, 2.85, 21.5, 0.3, 0.05, 8, M.frame, { collide: false, cast: false });
  gun('m4a4', 14.2, 0, 21.5);
  prop('extinguisher', 6.6, 0, 26.8);
  prop('monitor', 23, 0, 16.2, -0.5, 2);
  prop('bin', 23.2, 0, 27.2);

  /* ---------- open plan ---------- */
  const podMonitorVariants = [0, 1, 2, 3, 4, 5];
  let podIndex = 0;
  function deskPod(cx, cz) {
    const TOP = 0.75;
    for (const row of [-1, 1]) {
      const rz = cz + row * 0.43;
      solid(cx, TOP - 0.04, rz, 3.2, 0.04, 0.8, M.wood, { radar: false });
      for (const ex of [-1.57, 0, 1.57]) solid(cx + ex, 0, rz, 0.05, TOP - 0.04, 0.72, M.frame, { collide: false });
      colliders.push({ x: cx, y: TOP / 2, z: rz, hx: 1.6, hy: TOP / 2, hz: 0.4 });
      for (const side of [-0.8, 0.8]) {
        const dx = cx + side;
        const facing = row < 0 ? Math.PI : 0;
        const mz = cz + row * 0.12;
        const v = podMonitorVariants[(podIndex++) % 6];
        stamp(buildPropMesh('monitor', v), dx - 0.3, TOP + 0.24, mz, facing);
        stamp(buildPropMesh('monitor', v + 1), dx + 0.3, TOP + 0.24, mz, facing + (row < 0 ? 0.2 : -0.2));
        prop('keyboard', dx, TOP, cz + row * 0.62, 0, podIndex);
        if (podIndex % 3 === 0) prop('mug', dx + 0.55, TOP, cz + row * 0.6, 0, podIndex);
        if (podIndex % 5 === 1) prop('phone', dx - 0.6, TOP, cz + row * 0.58, row < 0 ? 0.3 : Math.PI - 0.3);
        deco(boxGeo(0.2, 0.45, 0.45), M.blackPlastic, trs(dx + 0.55, 0.23, cz + row * 0.5));
        deco(boxGeo(0.005, 0.3, 0.01), M.blueTrim, trs(dx + 0.45, 0.3, cz + row * 0.5 + row * 0.226), false);
        const chair = buildPropMesh('chair', podIndex);
        stamp(chair, dx, PROPS.chair.half[1], cz + row * 1.3, row < 0 ? 0 : Math.PI);
        colliders.push({ x: dx, y: 0.25, z: cz + row * 1.3, hx: 0.27, hy: 0.25, hz: 0.27 });
      }
    }
    solid(cx, 0, cz, 3.3, 1.3, 0.06, M.fabric);
    solid(cx, 1.3, cz, 3.34, 0.03, 0.08, M.frame, { collide: false });
    radar.push({ x: cx, z: cz, hx: 1.6, hz: 0.83, tall: false });
  }
  for (const x of [-18.5, -6, 6, 18.5]) for (const z of [-8, 8]) deskPod(x, z);

  for (const [x, z] of [[-12, 0], [12, 0], [-24, -8], [24, 8]]) {
    solid(x, 0, z, 0.8, WALL_H, 0.8, M.concrete);
    prop('plant', x + 0.75, 0, z + 0.75, 0, Math.abs(x | 0));
  }
  prop('extinguisher', -12.5, 0, -0.55);
  prop('extinguisher', 12.5, 0, 0.55);
  solid(0, 0, 0, 4.2, 1.1, 1.2, M.darkWood);
  solid(0, 1.1, 0, 4.3, 0.04, 1.3, stone, { radar: false });
  gun('ak47', 0, 1.14, 0);
  prop('printer', -1.4, 1.14, 0.1, 0.1);
  prop('mug', 1.2, 1.14, -0.2, 0, 1);
  solid(-12, 0, 8, 0.5, 2.0, 2.4, M.darkWood);
  solid(12, 0, -8, 0.5, 2.0, 2.4, M.darkWood);
  for (const [x, z] of [[-12, 8], [12, -8]]) for (let s = 0; s < 3; s++) {
    for (let k = -1.05; k < 1.05; k += 0.07) deco(boxGeo(0.34, 0.3, 0.055), bookMats[Math.abs(Math.floor(k * 50 + s * 3 + x)) % 6], trs(x, 0.3 + s * 0.6 + 0.15, z + k));
  }
  for (const [x, z] of [[-9, -12.5], [9, 12.5]]) solid(x, 0, z, 2.4, 1.25, 0.5, M.frame);
  gun('ak47', -26, 0, 8);
  gun('ak47', 26, 0, -8);
  gun('mp5', -12, 0, -3);
  gun('mp5', 12, 0, 3);
  prop('bin', -9.5, 0, -12, 0);
  prop('bin', 9.5, 0, 12, 0);
  deco(new THREE.PlaneGeometry(1.1, 1.55), M.posters[1], trs(-23.88, 1.7, -8, 0, Math.PI / 2), false);
  deco(new THREE.PlaneGeometry(1.1, 1.55), M.posters[2], trs(23.88, 1.7, 8, 0, -Math.PI / 2), false);

  /* ---------- AUTO spawn: automotive garage ---------- */
  function car(cx, cz) {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); };
    add(new THREE.BoxGeometry(1.85, 0.62, 4.3), carPaint, 0, 0.62, 0);
    add(new THREE.BoxGeometry(1.6, 0.55, 2.1), carPaint, 0, 1.2, -0.2);
    add(new THREE.BoxGeometry(1.62, 0.45, 2.0), M.glass, 0, 1.2, -0.2);
    add(new THREE.BoxGeometry(1.7, 0.18, 0.1), M.chrome, 0, 0.55, 2.16);
    add(new THREE.BoxGeometry(1.7, 0.18, 0.1), M.chrome, 0, 0.55, -2.16);
    for (const sx of [-0.85, 0.85]) {
      add(new THREE.BoxGeometry(0.3, 0.12, 0.02), new THREE.MeshStandardMaterial({ emissive: 0xfff1c0, emissiveIntensity: 2, color: 0xffffff }), sx * 0.8, 0.72, 2.16);
      for (const sz of [-1.35, 1.35]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 20), rubber);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(sx, 0.34, sz); g.add(wheel);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.28, 12), M.chrome);
        rim.rotation.z = Math.PI / 2; rim.position.set(sx, 0.34, sz); g.add(rim);
      }
    }
    stamp(g, cx, 0, cz);
    colliders.push({ x: cx, y: 0.47, z: cz, hx: 0.93, hy: 0.47, hz: 2.15 });
    colliders.push({ x: cx, y: 1.22, z: cz - 0.2, hx: 0.8, hy: 0.28, hz: 1.05 });
    radar.push({ x: cx, z: cz, hx: 0.93, hz: 2.15, tall: false });
  }
  car(-34.5, 12);
  function tires(x, z, n) {
    for (let i = 0; i < n; i++) deco(new THREE.TorusGeometry(0.3, 0.13, 10, 20), rubber, trs(x, 0.13 + i * 0.26, z, Math.PI / 2));
    collider(x, n * 0.13, z, 0.43, n * 0.13, 0.43);
  }
  tires(-38.8, -26.8, 4); tires(-37.9, -26.8, 3); tires(-38.8, 26.8, 5); tires(-31, -9, 3);
  solid(-39.4, 0, -12, 0.8, 1.05, 1.6, M.red);
  for (let d = 0; d < 5; d++) solid(-39.0, 0.15 + d * 0.18, -12, 0.02, 0.02, 1.2, M.chrome, { collide: false });
  solid(-33, 0, -20, 1.4, 0.14, 1.2, M.wood);
  solid(-33, 0.14, -20, 0.9, 0.8, 0.7, M.darkMetal);
  deco(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 12), M.chrome, trs(-33, 0.75, -20, 0, 0, Math.PI / 2));
  for (const z of [-4.5, 4.5]) {
    const x = -39.4, levels = [0.12, 0.66, 1.2, 1.74];
    for (const dx of [-0.32, 0.32]) for (const dz of [-1.47, 1.47]) solid(x + dx, 0, z + dz, 0.05, 2.2, 0.05, M.orangeTrim, { collide: false });
    for (const y of levels) {
      solid(x, y, z, 0.7, 0.04, 3, M.metal, { collide: false });
      for (let k = -1; k <= 1; k++) if ((k + y * 10 | 0) % 3) deco(boxGeo(0.5, 0.34, 0.7), cardboard, trs(x, y + 0.21, z + k * 0.92, 0, (k * 0.13) % 0.2));
    }
    collider(x, 1.1, z, 0.35, 1.1, 1.5);
  }
  solid(-31.5, 0, 22, 1.5, 1.2, 1.5, cardboard);
  solid(-31.5, 1.2, 22.2, 1, 0.8, 1, cardboard);
  gun('mp5', -34, 0, 24);
  prop('extinguisher', -39.5, 0, 8.6);
  prop('bin', -29, 0, -26.8);
  prop('monitor', -33, 0.94, -20, 0.6, 3);

  /* ---------- DJB spawn: corporate lounge ---------- */
  solid(34, 0.72, 12, 2.74, 0.04, 1.52, new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.6 }));
  solid(34, 0.76, 12, 0.02, 0.15, 1.6, M.whitePlastic, { collide: false });
  solid(34, 0, 12, 2.4, 0.72, 1.2, M.darkMetal, { collide: false });
  colliders.push({ x: 34, y: 0.38, z: 12, hx: 1.37, hy: 0.38, hz: 0.76 });
  radar.push({ x: 34, z: 12, hx: 1.37, hz: 0.76, tall: false });
  for (const z of [-24, -20, -16]) {
    solid(39.4, 0, z, 0.7, 1.35, 1.8, M.greyPlastic);
    for (let d = 0; d < 3; d++) solid(39.04, 0.2 + d * 0.43, z, 0.02, 0.03, 0.3, M.chrome, { collide: false });
  }
  for (const [x, z] of [[31.5, -22], [33, 22], [31.5, 23.3]]) {
    solid(x, 0, z, 1.2, 1.2, 1.2, cardboard);
    solid(x + 0.1, 1.2, z, 0.8, 0.6, 0.8, cardboard, { radar: false });
  }
  solid(39.2, 0, 4.5, 0.9, 0.45, 3, M.leather);
  solid(39.55, 0.45, 4.5, 0.2, 0.5, 3, M.leather, { radar: false });
  deco(planeGeo(3.2, 4.4), new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 1 }), trs(37.6, 0.006, 5.2, -Math.PI / 2), false);
  solid(37.5, 0, 4.5, 0.8, 0.4, 1.5, M.darkWood);
  prop('mug', 37.4, 0.4, 4.1, 0, 1);
  prop('laptop', 37.6, 0.4, 4.9, Math.PI / 2, 0);
  solid(37.2, 0, 7.4, 2.6, 0.45, 0.9, M.leather);
  solid(37.2, 0.45, 7.75, 2.6, 0.5, 0.2, M.leather, { radar: false });
  for (const sx of [-1.35, 1.35]) solid(37.2 + sx, 0.45, 7.4, 0.12, 0.25, 0.9, M.leather, { radar: false, collide: false });
  solid(39.5, 0, -6, 0.4, 1.1, 0.4, M.whitePlastic);
  deco(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.6, roughness: 0.1 }), trs(39.5, 1.3, -6), false);
  gun('mp5', 34, 0, -24);
  prop('extinguisher', 39.5, 0, -8.6);
  prop('bin', 29, 0, 26.8);
  prop('plant', 39.3, 0, 26.9, 0, 5);
  prop('plant', 39.3, 0, -26.9, 0, 6);

  /* ---------- ceiling lights ---------- */
  const xs = [-36, -31, -26, -20, -15, -10, -3, 3, 10, 15, 20, 26, 31, 36];
  const zs = [-25, -20, -10, -4, 4, 10, 20, 25];
  for (const x of xs) for (const z of zs) {
    deco(boxGeo(1.2, 0.04, 0.6), M.lightPanel, trs(x, WALL_H - 0.02, z), false);
    deco(boxGeo(1.28, 0.03, 0.68), M.frame, trs(x, WALL_H - 0.012, z), false);
  }

  const meshes = batch.build(root);
  for (const m of meshes) {
    if (m.material === M.ceiling || m.material === M.lightPanel) continue;
    m.layers.enable(2);
  }
  root.traverse(o => {
    if (o.material && o.material.envMapIntensity !== undefined && o.material !== M.glass && o.material !== M.chrome) o.material.envMapIntensity = 0.45;
  });

  const lights = addLights(scene, quality);
  return { root, colliders, radar, gunSpots, propSpots, bounds: BOUNDS, spawns: SPAWNS, lights };
}

// yaw -PI/2 faces +x (towards the enemy), +PI/2 faces -x.
export const SPAWNS = {
  1: [[-36, -22], [-36, -10], [-36, 0], [-36, 10], [-36, 20], [-31, -5], [-31, 5], [-33, -15], [-33, 16]].map(([x, z]) => ({ x, z, yaw: -Math.PI / 2 })),
  2: [[36, -22], [36, -10], [36, 0], [36, 10], [36, 20], [31, -5], [31, 5], [33, -15], [33, 16]].map(([x, z]) => ({ x, z, yaw: Math.PI / 2 })),
};

function addLights(scene, quality) {
  const lights = [];
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x4a4238, 0.9));

  const sun = new THREE.DirectionalLight(0xffe3b8, quality.shadows ? 4.2 : 1.2);
  sun.position.set(28, 26, 60);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  if (quality.shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 45, bottom: -45, near: 10, far: 160 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
  }

  // Soft overhead key light: the ceiling is excluded from its shadow pass (layer 2 only),
  // so furniture gets grounded contact shadows as if lit by the ceiling panels.
  const overhead = new THREE.DirectionalLight(0xfff4e6, 1.9);
  overhead.position.set(6, 40, 9);
  overhead.target.position.set(0, 0, 0);
  scene.add(overhead, overhead.target);
  if (quality.shadows) {
    overhead.castShadow = true;
    overhead.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    Object.assign(overhead.shadow.camera, { left: -42, right: 42, top: 30, bottom: -30, near: 30, far: 50 });
    overhead.shadow.camera.layers.set(2);
    overhead.shadow.bias = -0.0005;
    overhead.shadow.normalBias = 0.04;
    overhead.shadow.radius = 4;
  }

  const spots = [
    [0, 0, 0xfff1dc, 14], [-18.5, -8, 0xfff1dc, 12], [18.5, 8, 0xfff1dc, 12], [-18.5, 8, 0xfff1dc, 12], [18.5, -8, 0xfff1dc, 12],
    [-34, 0, 0xffc890, 9], [34, 0, 0xb4d2ff, 9], [15, 21.5, 0x60a5fa, 14], [-15, -21.5, 0xfff1dc, 12], [15, -21.5, 0xffe0b0, 12],
    [-15, 21.5, 0xfff1dc, 12], [0, -21, 0xfff1dc, 10], [-6, -8, 0xfff1dc, 10], [6, 8, 0xfff1dc, 10], [0, 22, 0xfff1dc, 10], [-34, 20, 0xffb070, 10],
  ];
  for (const [x, z, color, power] of spots.slice(0, quality.lights)) {
    const l = new THREE.SpotLight(color, power * 2.4, 14, 1.2, 0.85, 1.3);
    l.position.set(x, WALL_H - 0.05, z);
    l.target.position.set(x, 0, z);
    scene.add(l, l.target);
    lights.push(l);
  }
  return { sun, overhead, points: lights };
}
