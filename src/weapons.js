import * as THREE from 'three';
import { TEX } from './textures.js';
import { compactChildren } from './geometry.js';

// Models are in metres, built along -Z (muzzle forward) with the origin at the trigger.
let MAT = null;

// Shared micro-surface maps keep finishes readable under the room lights without
// adding asset downloads or per-weapon texture allocations.
function surfaceGrain(seed, contrast) {
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let i = 0; i < data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 225 - ((seed >>> 24) * contrast);
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(3, 3);
  texture.needsUpdate = true;
  return texture;
}

function mats() {
  if (MAT) return MAT;
  const wood = TEX.wood().clone();
  wood.repeat.set(0.35, 0.35);
  wood.needsUpdate = true;
  const metalGrain = surfaceGrain(3181, 0.13);
  const polymerGrain = surfaceGrain(871, 0.34);
  MAT = {
    gunMetal: new THREE.MeshStandardMaterial({ color: 0x30343b, roughness: 0.48, metalness: 0.8, roughnessMap: metalGrain, bumpMap: metalGrain, bumpScale: 0.00016 }),
    blued: new THREE.MeshStandardMaterial({ color: 0x303b49, roughness: 0.34, metalness: 0.9, roughnessMap: metalGrain }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x25292c, roughness: 0.92, metalness: 0.03, roughnessMap: polymerGrain, bumpMap: polymerGrain, bumpScale: 0.0003 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa1a9, roughness: 0.22, metalness: 1 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, color: 0xc0703f, roughness: 0.42, metalness: 0 }),
    bakelite: new THREE.MeshStandardMaterial({ color: 0x7a3515, roughness: 0.4, metalness: 0.05 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4a5634, roughness: 0.6, metalness: 0.1 }),
    tan: new THREE.MeshStandardMaterial({ color: 0x9c8a66, roughness: 0.88, metalness: 0.05, roughnessMap: polymerGrain, bumpMap: polymerGrain, bumpScale: 0.00025 }),
    anodizedTan: new THREE.MeshStandardMaterial({ color: 0xb39a68, roughness: 0.47, metalness: 0.65, roughnessMap: metalGrain }),
    recess: new THREE.MeshStandardMaterial({ color: 0x080b0e, roughness: 0.96, metalness: 0.05 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x0b1a2a, roughness: 0.05, metalness: 0.6, emissive: 0x0a2440, emissiveIntensity: 0.4 }),
    redDot: new THREE.MeshBasicMaterial({ color: 0xff2020 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc8a24a, roughness: 0.3, metalness: 1 }),
    warhead: new THREE.MeshStandardMaterial({ color: 0x3d4a2a, roughness: 0.5, metalness: 0.3 }),
    blade: new THREE.MeshStandardMaterial({ color: 0xd5dbe2, roughness: 0.12, metalness: 1 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.85 }),
  };
  return MAT;
}

function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

// A small chamfer catches highlights on large receiver/stock shapes. Fine
// hardware remains simple geometry and is merged by compactChildren below.
function bevelBox(parent, w, h, d, mat, x = 0, y = 0, z = 0, r = 0.002) {
  r = Math.min(r, w * 0.2, h * 0.2, d * 0.2);
  const a = w / 2 - r, b = h / 2 - r, depth = d - r * 2;
  const shape = new THREE.Shape();
  shape.moveTo(-a, -b); shape.lineTo(a, -b); shape.lineTo(a, b); shape.lineTo(-a, b); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelThickness: r, bevelSize: r, curveSegments: 1 });
  geo.translate(0, 0, -depth / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z); parent.add(mesh);
  return mesh;
}

function sidePin(parent, x, y, z, M, radius = 0.0035) {
  const head = cyl(parent, radius, radius, 0.002, M.blued, x, y, z, 8);
  head.rotation.set(0, 0, Math.PI / 2);
  box(parent, 0.0022, 0.001, radius * 1.25, M.recess, x, y, z);
}

function ironSight(parent, z, y, M, front = false) {
  box(parent, 0.026, 0.01, 0.021, M.gunMetal, 0, y - 0.018, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(front ? 0.012 : 0.008, 0.0023, 6, 14), M.gunMetal);
  ring.position.set(0, y, z); parent.add(ring);
  if (front) box(parent, 0.0025, 0.013, 0.003, M.blued, 0, y - 0.007, z);
}
// Cylinder along Z.
function cyl(parent, r1, r2, len, mat, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function marker(parent, name, x, y, z) {
  const o = new THREE.Object3D();
  o.name = name; o.position.set(x, y, z);
  parent.add(o);
  return o;
}

function rail(parent, len, x, y, z, M) {
  box(parent, 0.022, 0.008, len, M.gunMetal, x, y, z);
  for (let i = 0; i < Math.floor(len / 0.01); i += 1) box(parent, 0.024, 0.006, 0.005, M.gunMetal, x, y + 0.006, z - len / 2 + i * 0.01 + 0.005);
}

function curvedMag(parent, M, mat, segs, w, h, d, curve, x, y, z) {
  const mag = new THREE.Group();
  mag.position.set(x, y, z);
  for (let i = 0; i < segs; i++) box(mag, w, h * 1.05, d, mat, 0, -i * h, -i * i * curve, -i * curve * 9);
  box(mag, w + 0.004, 0.012, d + 0.01, M.gunMetal, 0, -segs * h + h * 0.4, -(segs - 1) * (segs - 1) * curve, -(segs - 1) * curve * 9);
  parent.add(mag);
  return mag;
}

const builders = {
  glock(g, M) {
    const slide = new THREE.Group(); slide.name = 'slide'; g.add(slide);
    box(slide, 0.029, 0.034, 0.19, M.blued, 0, 0.052, -0.035);
    for (let i = 0; i < 6; i++) box(slide, 0.03, 0.026, 0.003, M.gunMetal, 0, 0.052, 0.045 + i * 0.006);
    box(slide, 0.006, 0.008, 0.01, M.gunMetal, 0, 0.073, -0.12);
    box(slide, 0.02, 0.008, 0.008, M.gunMetal, 0, 0.073, 0.05);
    box(slide, 0.01, 0.012, 0.028, M.gunMetal, 0.0146, 0.056, -0.015);
    cyl(g, 0.0065, 0.0065, 0.02, M.steel, 0, 0.055, -0.13, 10);
    box(g, 0.027, 0.022, 0.165, M.polymer, 0, 0.026, -0.03);
    box(g, 0.027, 0.012, 0.05, M.polymer, 0, 0.012, -0.08);
    box(g, 0.029, 0.11, 0.048, M.polymer, 0, -0.035, 0.035, 0.28);
    for (let i = 0; i < 4; i++) box(g, 0.03, 0.004, 0.05, M.gunMetal, 0, -0.01 - i * 0.02, 0.035 + i * 0.006, 0.28);
    box(g, 0.004, 0.005, 0.05, M.polymer, 0, -0.005, -0.03);
    box(g, 0.004, 0.022, 0.004, M.polymer, 0, 0.005, -0.055);
    box(g, 0.004, 0.018, 0.004, M.steel, 0, 0.012, -0.03, 0.3);
    const mag = new THREE.Group(); mag.name = 'mag'; g.add(mag);
    box(mag, 0.026, 0.014, 0.05, M.polymer, 0, -0.092, 0.05, 0.28);
    marker(g, 'muzzle', 0, 0.055, -0.14);
    marker(g, 'eject', 0.02, 0.06, -0.01);
  },

  mp5(g, M) {
    box(g, 0.042, 0.055, 0.29, M.gunMetal, 0, 0.03, -0.05);
    cyl(g, 0.022, 0.022, 0.29, M.gunMetal, 0, 0.055, -0.05);
    cyl(g, 0.028, 0.028, 0.27, M.gunMetal, 0, 0.045, -0.33, 20);
    cyl(g, 0.02, 0.02, 0.01, M.steel, 0, 0.045, -0.47, 20);
    box(g, 0.05, 0.05, 0.16, M.polymer, 0, 0.02, -0.25);
    for (let i = 0; i < 5; i++) box(g, 0.052, 0.004, 0.02, M.gunMetal, 0, 0.0, -0.31 + i * 0.03);
    box(g, 0.012, 0.03, 0.03, M.gunMetal, 0, 0.09, -0.2);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 12), M.gunMetal);
    drum.rotation.z = Math.PI / 2; drum.position.set(0, 0.088, 0.06); g.add(drum);
    box(g, 0.006, 0.01, 0.08, M.gunMetal, -0.028, 0.06, -0.17);
    box(g, 0.018, 0.008, 0.012, M.gunMetal, -0.036, 0.062, -0.13);
    box(g, 0.03, 0.1, 0.045, M.polymer, 0, -0.04, 0.05, 0.25);
    box(g, 0.036, 0.018, 0.1, M.polymer, 0, -0.005, 0.02);
    box(g, 0.004, 0.024, 0.004, M.steel, 0, -0.012, 0.01, 0.3);
    cyl(g, 0.006, 0.006, 0.16, M.steel, 0.015, 0.03, 0.17, 8);
    cyl(g, 0.006, 0.006, 0.16, M.steel, -0.015, 0.03, 0.17, 8);
    box(g, 0.045, 0.1, 0.03, M.polymer, 0, 0.01, 0.26);
    const mag = curvedMag(g, M, M.gunMetal, 5, 0.022, 0.032, 0.038, 0.004, 0, -0.01, -0.06);
    mag.name = 'mag';
    marker(g, 'muzzle', 0, 0.045, -0.48);
    marker(g, 'eject', 0.025, 0.06, -0.06);
  },

  ump45(g, M) {
    // Slab-sided polymer receiver, straight .45 magazine and open folding stock
    // give the UMP a different silhouette from the MP5, even as a ground pickup.
    bevelBox(g, 0.054, 0.073, 0.31, M.polymer, 0, 0.037, -0.035, 0.003);
    bevelBox(g, 0.049, 0.036, 0.135, M.polymer, 0, -0.01, 0.015);
    bevelBox(g, 0.055, 0.065, 0.11, M.polymer, 0, 0.025, -0.245);
    rail(g, 0.29, 0, 0.078, -0.053, M);
    rail(g, 0.11, 0, -0.013, -0.242, M);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        box(g, 0.002, 0.012, 0.012, M.recess, side * 0.028, 0.046, -0.286 + i * 0.026);
      }
      box(g, 0.002, 0.006, 0.185, M.gunMetal, side * 0.028, 0.005, -0.087);
      sidePin(g, side * 0.028, 0.026, 0.072, M);
      sidePin(g, side * 0.029, 0.018, -0.2, M);
    }
    // Charging slot and ejector stay on opposite sides of the receiver.
    box(g, 0.002, 0.011, 0.107, M.recess, -0.028, 0.055, -0.143);
    box(g, 0.016, 0.008, 0.018, M.gunMetal, -0.034, 0.055, -0.17);
    box(g, 0.002, 0.018, 0.073, M.recess, 0.028, 0.047, -0.045);
    box(g, 0.0022, 0.009, 0.049, M.steel, 0.029, 0.047, -0.035);
    cyl(g, 0.013, 0.013, 0.102, M.blued, 0, 0.04, -0.33, 16);
    cyl(g, 0.018, 0.018, 0.038, M.gunMetal, 0, 0.04, -0.386, 12);
    cyl(g, 0.01, 0.01, 0.001, M.recess, 0, 0.04, -0.406, 14);
    for (let i = 0; i < 3; i++) box(g, 0.037, 0.005, 0.004, M.recess, 0, 0.04, -0.378 - i * 0.009);
    box(g, 0.014, 0.035, 0.018, M.gunMetal, 0, 0.076, -0.265);
    ironSight(g, -0.265, 0.113, M, true);
    ironSight(g, 0.069, 0.112, M);

    const grip = bevelBox(g, 0.032, 0.099, 0.044, M.polymer, 0, -0.056, 0.054, 0.003);
    grip.rotation.x = 0.23;
    for (let i = 0; i < 4; i++) box(g, 0.033, 0.003, 0.045, M.gunMetal, 0, -0.028 - i * 0.02, 0.048 + i * 0.0045, 0.23);
    box(g, 0.008, 0.007, 0.064, M.polymer, 0, -0.037, -0.006);
    box(g, 0.008, 0.03, 0.007, M.polymer, 0, -0.022, -0.034);
    box(g, 0.004, 0.024, 0.005, M.blued, 0, -0.023, 0.007, 0.28);
    box(g, 0.004, 0.007, 0.023, M.gunMetal, -0.029, 0.012, 0.036, 0.4);

    bevelBox(g, 0.05, 0.077, 0.031, M.gunMetal, 0, 0.026, 0.135);
    bevelBox(g, 0.041, 0.027, 0.215, M.polymer, 0, 0.05, 0.256);
    const strut = bevelBox(g, 0.027, 0.018, 0.202, M.polymer, 0, -0.016, 0.249);
    strut.rotation.x = 0.18;
    bevelBox(g, 0.043, 0.103, 0.032, M.polymer, 0, 0.007, 0.366, 0.004);
    box(g, 0.046, 0.105, 0.007, M.recess, 0, 0.007, 0.383);
    for (let i = 0; i < 5; i++) box(g, 0.047, 0.004, 0.002, M.gunMetal, 0, -0.03 + i * 0.018, 0.388);

    const mag = new THREE.Group(); mag.name = 'mag'; mag.position.set(0, -0.018, -0.086); g.add(mag);
    bevelBox(mag, 0.027, 0.198, 0.043, M.polymer, 0, -0.088, 0, 0.002);
    for (const side of [-1, 1]) {
      box(mag, 0.002, 0.148, 0.006, M.recess, side * 0.014, -0.095, -0.009);
      box(mag, 0.002, 0.148, 0.006, M.recess, side * 0.014, -0.095, 0.009);
    }
    bevelBox(mag, 0.033, 0.014, 0.051, M.gunMetal, 0, -0.187, 0, 0.001);
    marker(g, 'muzzle', 0, 0.04, -0.409);
    marker(g, 'eject', 0.033, 0.047, -0.045);
  },

  scar(g, M) {
    // Two-tone anodized upper, folding adjustable stock and uninterrupted rail.
    bevelBox(g, 0.056, 0.063, 0.435, M.anodizedTan, 0, 0.039, -0.098, 0.0035);
    bevelBox(g, 0.05, 0.043, 0.196, M.tan, 0, -0.013, 0.009, 0.003);
    bevelBox(g, 0.051, 0.047, 0.08, M.tan, 0, -0.035, -0.075);
    rail(g, 0.43, 0, 0.075, -0.098, M);
    rail(g, 0.133, 0, 0.002, -0.247, M);
    for (const side of [-1, 1]) {
      box(g, 0.006, 0.017, 0.122, M.gunMetal, side * 0.03, 0.022, -0.247);
      for (let i = 0; i < 8; i++) box(g, 0.008, 0.024, 0.005, M.blued, side * 0.033, 0.022, -0.3 + i * 0.015);
      for (let i = 0; i < 5; i++) box(g, 0.002, 0.01, 0.014, M.recess, side * 0.029, 0.054, -0.283 + i * 0.029);
      for (const z of [-0.293, -0.179, 0.066]) sidePin(g, side * 0.029, 0.018, z, M);
    }
    box(g, 0.002, 0.013, 0.153, M.recess, -0.029, 0.044, -0.069);
    box(g, 0.019, 0.009, 0.021, M.gunMetal, -0.038, 0.044, -0.065);
    box(g, 0.002, 0.019, 0.083, M.recess, 0.029, 0.04, -0.033);
    box(g, 0.0022, 0.009, 0.052, M.blued, 0.03, 0.039, -0.019);
    cyl(g, 0.011, 0.011, 0.218, M.blued, 0, 0.032, -0.404, 16);
    box(g, 0.027, 0.029, 0.039, M.gunMetal, 0, 0.043, -0.34);
    cyl(g, 0.017, 0.017, 0.056, M.gunMetal, 0, 0.032, -0.536, 12);
    for (let i = 0; i < 3; i++) box(g, 0.035, 0.008, 0.005, M.recess, 0, 0.032, -0.524 - i * 0.013);
    cyl(g, 0.008, 0.008, 0.001, M.recess, 0, 0.032, -0.565, 12);
    ironSight(g, -0.297, 0.112, M, true);
    ironSight(g, 0.089, 0.112, M);

    // Compact holographic-style optic with a separate glass surface.
    const optic = new THREE.Group(); g.add(optic);
    bevelBox(optic, 0.039, 0.011, 0.06, M.gunMetal, 0, 0.09, -0.05, 0.001);
    for (const x of [-0.019, 0.019]) bevelBox(optic, 0.005, 0.041, 0.048, M.gunMetal, x, 0.112, -0.05, 0.001);
    bevelBox(optic, 0.04, 0.005, 0.048, M.gunMetal, 0, 0.135, -0.05, 0.001);
    const glass = box(optic, 0.032, 0.034, 0.002, M.lens, 0, 0.114, -0.065);
    glass.material = M.lens.clone(); glass.material.transparent = true; glass.material.opacity = 0.28; glass.material.depthWrite = false;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 10), M.redDot);
    dot.position.set(0, 0.114, -0.0635); optic.add(dot);

    const grip = bevelBox(g, 0.032, 0.101, 0.047, M.polymer, 0, -0.065, 0.065, 0.003);
    grip.rotation.x = 0.28;
    for (let i = 0; i < 4; i++) box(g, 0.034, 0.003, 0.045, M.recess, 0, -0.038 - i * 0.018, 0.058 + i * 0.005, 0.28);
    box(g, 0.008, 0.006, 0.063, M.tan, 0, -0.039, 0.0);
    box(g, 0.008, 0.027, 0.007, M.tan, 0, -0.025, -0.031);
    box(g, 0.004, 0.025, 0.005, M.blued, 0, -0.023, 0.008, 0.32);
    box(g, 0.005, 0.009, 0.027, M.gunMetal, -0.028, -0.006, 0.049, 0.4);
    bevelBox(g, 0.058, 0.072, 0.032, M.tan, 0, 0.03, 0.137, 0.003);
    bevelBox(g, 0.047, 0.039, 0.186, M.tan, 0, 0.043, 0.239, 0.004);
    bevelBox(g, 0.053, 0.028, 0.12, M.polymer, 0, 0.071, 0.242, 0.004);
    const lowerStock = bevelBox(g, 0.037, 0.039, 0.135, M.tan, 0, -0.003, 0.281, 0.004);
    lowerStock.rotation.x = 0.15;
    bevelBox(g, 0.054, 0.122, 0.047, M.tan, 0, 0.014, 0.352, 0.005);
    bevelBox(g, 0.057, 0.126, 0.015, M.polymer, 0, 0.014, 0.382, 0.003);
    for (let i = 0; i < 4; i++) box(g, 0.058, 0.003, 0.018, M.recess, 0, -0.025 + i * 0.023, 0.382);
    sidePin(g, -0.03, 0.038, 0.141, M, 0.008);
    sidePin(g, 0.03, 0.038, 0.141, M, 0.008);

    const mag = curvedMag(g, M, M.gunMetal, 8, 0.027, 0.021, 0.064, 0.0007, 0, -0.04, -0.076);
    mag.name = 'mag';
    for (const side of [-1, 1]) {
      for (let i = 1; i < 8; i++) {
        for (const z of [-0.016, 0.016]) box(mag, 0.002, 0.021, 0.004, M.blued, side * 0.014, -i * 0.021, z - i * i * 0.0007, -i * 0.0063);
      }
    }
    marker(g, 'muzzle', 0, 0.032, -0.568);
    marker(g, 'eject', 0.033, 0.04, -0.033);
  },

  nova(g, M) {
    box(g, 0.045, 0.07, 0.22, M.gunMetal, 0, 0.03, -0.02);
    cyl(g, 0.013, 0.013, 0.52, M.blued, 0, 0.05, -0.39, 14);
    cyl(g, 0.013, 0.013, 0.42, M.gunMetal, 0, 0.018, -0.33, 14);
    box(g, 0.006, 0.008, 0.008, M.steel, 0, 0.066, -0.64);
    const pump = new THREE.Group(); pump.name = 'pump'; g.add(pump);
    box(pump, 0.05, 0.048, 0.17, M.polymer, 0, 0.022, -0.3);
    for (let i = 0; i < 6; i++) box(pump, 0.052, 0.05, 0.006, M.gunMetal, 0, 0.022, -0.37 + i * 0.028);
    box(g, 0.04, 0.09, 0.05, M.polymer, 0, -0.04, 0.12, 0.35);
    box(g, 0.042, 0.075, 0.3, M.polymer, 0, -0.02, 0.28, -0.09);
    box(g, 0.046, 0.09, 0.02, M.gunMetal, 0, -0.035, 0.43, -0.09);
    box(g, 0.004, 0.024, 0.004, M.steel, 0, -0.015, 0.06, 0.3);
    const mag = new THREE.Group(); mag.name = 'mag'; g.add(mag);
    const shell = cyl(mag, 0.01, 0.01, 0.06, new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.5 }), 0, -0.005, 0.02, 10);
    cyl(mag, 0.0105, 0.0105, 0.012, M.brass, 0, -0.005, 0.055, 10);
    shell.visible = true;
    marker(g, 'muzzle', 0, 0.05, -0.66);
    marker(g, 'eject', 0.026, 0.05, -0.02);
  },

  ak47(g, M) {
    box(g, 0.045, 0.065, 0.32, M.gunMetal, 0, 0.022, -0.02);
    cyl(g, 0.021, 0.021, 0.3, M.gunMetal, 0, 0.052, 0.005, 16);
    box(g, 0.042, 0.02, 0.3, M.gunMetal, 0, 0.045, 0.005);
    cyl(g, 0.011, 0.011, 0.44, M.blued, 0, 0.035, -0.39, 12);
    cyl(g, 0.012, 0.012, 0.26, M.gunMetal, 0, 0.065, -0.3, 12);
    cyl(g, 0.019, 0.019, 0.2, M.wood, 0, 0.066, -0.26, 16);
    box(g, 0.052, 0.045, 0.2, M.wood, 0, 0.018, -0.27);
    box(g, 0.054, 0.006, 0.18, M.gunMetal, 0, 0.004, -0.27);
    box(g, 0.012, 0.06, 0.018, M.gunMetal, 0, 0.06, -0.55);
    cyl(g, 0.009, 0.009, 0.02, M.gunMetal, 0, 0.09, -0.55, 10);
    cyl(g, 0.016, 0.014, 0.06, M.gunMetal, 0, 0.035, -0.64, 12);
    box(g, 0.028, 0.018, 0.05, M.gunMetal, 0, 0.078, -0.12);
    box(g, 0.004, 0.008, 0.012, M.gunMetal, 0, 0.09, -0.12);
    box(g, 0.012, 0.012, 0.03, M.steel, 0.028, 0.035, -0.07);
    box(g, 0.004, 0.02, 0.14, M.gunMetal, 0.024, 0.025, 0.03);
    box(g, 0.032, 0.1, 0.042, M.bakelite, 0, -0.04, 0.07, 0.32);
    box(g, 0.006, 0.006, 0.07, M.gunMetal, 0, -0.012, 0.015);
    box(g, 0.004, 0.022, 0.004, M.steel, 0, -0.002, 0.005, 0.3);
    box(g, 0.042, 0.07, 0.27, M.wood, 0, -0.005, 0.27, -0.1);
    box(g, 0.044, 0.105, 0.015, M.gunMetal, 0, -0.018, 0.405, -0.1);
    const mag = curvedMag(g, M, M.bakelite, 6, 0.028, 0.033, 0.07, 0.0045, 0, -0.022, -0.07);
    mag.name = 'mag';
    marker(g, 'muzzle', 0, 0.035, -0.68);
    marker(g, 'eject', 0.026, 0.05, -0.04);
  },

  m4a4(g, M) {
    box(g, 0.04, 0.055, 0.25, M.gunMetal, 0, 0.035, -0.04);
    box(g, 0.038, 0.05, 0.2, M.gunMetal, 0, -0.012, -0.01);
    box(g, 0.042, 0.06, 0.07, M.gunMetal, 0, -0.03, -0.075);
    rail(g, 0.25, 0, 0.066, -0.04, M);
    box(g, 0.05, 0.05, 0.24, M.gunMetal, 0, 0.03, -0.28);
    rail(g, 0.24, 0, 0.059, -0.28, M);
    for (let i = 0; i < 7; i++) {
      box(g, 0.052, 0.008, 0.018, M.polymer, 0, 0.012, -0.37 + i * 0.03);
      box(g, 0.052, 0.008, 0.018, M.polymer, 0, 0.042, -0.37 + i * 0.03);
    }
    cyl(g, 0.009, 0.009, 0.16, M.blued, 0, 0.03, -0.47, 12);
    cyl(g, 0.013, 0.013, 0.055, M.gunMetal, 0, 0.03, -0.56, 8);
    const dot = new THREE.Group(); g.add(dot);
    box(dot, 0.034, 0.008, 0.07, M.gunMetal, 0, 0.074, -0.02);
    box(dot, 0.004, 0.042, 0.07, M.gunMetal, 0.016, 0.096, -0.02);
    box(dot, 0.004, 0.042, 0.07, M.gunMetal, -0.016, 0.096, -0.02);
    box(dot, 0.034, 0.005, 0.07, M.gunMetal, 0, 0.119, -0.02);
    const glass = box(dot, 0.028, 0.034, 0.002, M.lens, 0, 0.097, -0.045);
    glass.material = M.lens.clone(); glass.material.transparent = true; glass.material.opacity = 0.35;
    const reticle = new THREE.Mesh(new THREE.CircleGeometry(0.0018, 10), M.redDot);
    reticle.position.set(0, 0.097, -0.0438); dot.add(reticle);
    box(g, 0.03, 0.1, 0.045, M.polymer, 0, -0.045, 0.07, 0.3);
    box(g, 0.004, 0.022, 0.004, M.steel, 0, -0.01, 0.01, 0.3);
    box(g, 0.006, 0.006, 0.06, M.gunMetal, 0, -0.022, 0.015);
    cyl(g, 0.015, 0.015, 0.2, M.gunMetal, 0, 0.03, 0.18, 14);
    box(g, 0.042, 0.07, 0.13, M.polymer, 0, 0.012, 0.29);
    box(g, 0.044, 0.08, 0.018, M.gunMetal, 0, 0.01, 0.36);
    box(g, 0.03, 0.012, 0.03, M.gunMetal, 0, 0.06, 0.1);
    const mag = curvedMag(g, M, M.gunMetal, 5, 0.025, 0.036, 0.065, 0.0022, 0, -0.035, -0.075);
    mag.name = 'mag';
    marker(g, 'muzzle', 0, 0.03, -0.59);
    marker(g, 'eject', 0.022, 0.04, -0.04);
  },

  awp(g, M) {
    cyl(g, 0.022, 0.022, 0.26, M.gunMetal, 0, 0.04, -0.05, 18);
    cyl(g, 0.013, 0.011, 0.6, M.gunMetal, 0, 0.04, -0.48, 14);
    cyl(g, 0.018, 0.018, 0.07, M.gunMetal, 0, 0.04, -0.8, 12);
    for (let i = 0; i < 3; i++) box(g, 0.038, 0.006, 0.008, M.polymer, 0, 0.04, -0.78 - i * 0.02);
    box(g, 0.055, 0.05, 0.42, M.olive, 0, 0.012, -0.24);
    box(g, 0.05, 0.12, 0.08, M.olive, 0, -0.03, 0.09, 0.2);
    box(g, 0.05, 0.08, 0.3, M.olive, 0, -0.005, 0.3, -0.05);
    box(g, 0.052, 0.05, 0.12, M.olive, 0, 0.055, 0.28);
    box(g, 0.056, 0.1, 0.02, M.polymer, 0, -0.01, 0.46, -0.05);
    box(g, 0.036, 0.06, 0.1, M.gunMetal, 0, -0.02, -0.08);
    box(g, 0.004, 0.022, 0.004, M.steel, 0, -0.012, 0.015, 0.3);
    const scope = new THREE.Group(); g.add(scope);
    cyl(scope, 0.017, 0.017, 0.26, M.gunMetal, 0, 0.098, -0.06, 18);
    cyl(scope, 0.03, 0.019, 0.08, M.gunMetal, 0, 0.098, -0.21, 20);
    cyl(scope, 0.024, 0.02, 0.06, M.gunMetal, 0, 0.098, 0.08, 20);
    const lens = cyl(scope, 0.028, 0.028, 0.002, M.lens, 0, 0.098, -0.251, 20);
    lens.material = M.lens;
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 12), M.gunMetal);
    knob.position.set(0, 0.125, -0.06); scope.add(knob);
    const knob2 = knob.clone(); knob2.rotation.z = Math.PI / 2; knob2.position.set(0.025, 0.098, -0.06); scope.add(knob2);
    for (const z of [-0.12, 0.01]) box(scope, 0.03, 0.04, 0.02, M.gunMetal, 0, 0.074, z);
    const bolt = new THREE.Group(); bolt.name = 'bolt'; g.add(bolt);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), M.steel);
    arm.rotation.z = Math.PI / 2; arm.position.set(0.035, 0.04, 0.03); bolt.add(arm);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.01, 10, 8), M.steel);
    ball.position.set(0.06, 0.04, 0.03); bolt.add(ball);
    const mag = new THREE.Group(); mag.name = 'mag'; g.add(mag);
    box(mag, 0.032, 0.045, 0.085, M.gunMetal, 0, -0.07, -0.08);
    marker(g, 'muzzle', 0, 0.04, -0.84);
    marker(g, 'eject', 0.025, 0.05, -0.02);
  },

  rpg(g, M) {
    cyl(g, 0.034, 0.034, 0.95, M.steel, 0, 0.06, -0.08, 18);
    cyl(g, 0.034, 0.075, 0.2, M.gunMetal, 0, 0.06, 0.48, 18);
    cyl(g, 0.043, 0.043, 0.22, M.wood, 0, 0.06, -0.08, 18);
    cyl(g, 0.043, 0.043, 0.08, M.wood, 0, 0.06, 0.12, 18);
    box(g, 0.028, 0.09, 0.04, M.gunMetal, 0, -0.02, 0.0, 0.2);
    box(g, 0.028, 0.08, 0.04, M.gunMetal, 0, -0.02, -0.18, 0.1);
    box(g, 0.03, 0.05, 0.1, M.olive, -0.045, 0.1, 0.05);
    cyl(g, 0.012, 0.012, 0.03, M.lens, -0.045, 0.11, 0.115, 10);
    box(g, 0.004, 0.03, 0.004, M.gunMetal, 0, 0.1, -0.5);
    const rocket = new THREE.Group(); rocket.name = 'rocket'; g.add(rocket);
    cyl(rocket, 0.05, 0.034, 0.1, M.warhead, 0, 0.06, -0.6, 18);
    cyl(rocket, 0.012, 0.05, 0.2, M.warhead, 0, 0.06, -0.75, 18);
    cyl(rocket, 0.01, 0.01, 0.04, M.steel, 0, 0.06, -0.87, 8);
    rocket.userData.isMag = true;
    marker(g, 'muzzle', 0, 0.06, -0.62);
    marker(g, 'eject', 0, 0.06, 0.58);
  },

  knife(g, M) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0.15, 0); s.quadraticCurveTo(0.185, 0.004, 0.2, 0.02);
    s.lineTo(0.165, 0.03); s.lineTo(0.1, 0.034); s.lineTo(0, 0.034); s.lineTo(0, 0);
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1 }), M.blade);
    blade.rotation.set(0, Math.PI / 2, 0);
    blade.position.set(0.0015, 0.0, -0.035);
    g.add(blade);
    box(g, 0.012, 0.05, 0.012, M.gunMetal, 0, 0.017, -0.03);
    box(g, 0.02, 0.03, 0.11, M.polymer, 0, 0.017, 0.03);
    for (let i = 0; i < 5; i++) box(g, 0.022, 0.032, 0.004, M.gunMetal, 0, 0.017, -0.01 + i * 0.02);
    box(g, 0.018, 0.028, 0.012, M.steel, 0, 0.017, 0.09);
    marker(g, 'muzzle', 0, 0.017, -0.24);
    marker(g, 'eject', 0, 0, 0);
  },
};

const protoCache = new Map();
export function buildWeapon(type) {
  if (!protoCache.has(type)) {
    const g = new THREE.Group();
    builders[type](g, mats());
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    compactChildren(g);
    protoCache.set(type, g);
  }
  const clone = protoCache.get(type).clone(true);
  const parts = {};
  clone.traverse(o => { if (o.name) parts[o.name] = o; });
  clone.userData.parts = parts;
  return clone;
}

// Where hands hold each weapon (weapon-local space) and where it sits in the view.
export const GRIPS = {
  knife: { r: [0, 0.017, 0.035], l: null, view: [0.17, -0.17, -0.36], vr: [0.15, 0.1, -0.25] },
  glock: { r: [0, -0.03, 0.04], l: [-0.012, -0.04, 0.03], view: [0.13, -0.14, -0.4], vr: [0, 0.03, 0] },
  mp5: { r: [0, -0.035, 0.055], l: [0, 0.0, -0.25], view: [0.15, -0.16, -0.4], vr: [0, 0.035, 0] },
  ump45: { r: [0, -0.051, 0.057], l: [0, -0.003, -0.242], view: [0.15, -0.17, -0.4], vr: [0, 0.035, 0] },
  scar: { r: [0, -0.051, 0.07], l: [0, 0.005, -0.254], view: [0.16, -0.18, -0.42], vr: [0, 0.035, 0] },
  nova: { r: [0, -0.035, 0.12], l: [0, 0.0, -0.3], view: [0.16, -0.17, -0.38], vr: [0, 0.035, 0] },
  ak47: { r: [0, -0.035, 0.075], l: [0, 0.0, -0.27], view: [0.16, -0.17, -0.42], vr: [0, 0.035, 0] },
  m4a4: { r: [0, -0.04, 0.075], l: [0, 0.01, -0.3], view: [0.16, -0.17, -0.42], vr: [0, 0.035, 0] },
  awp: { r: [0, -0.035, 0.1], l: [0, -0.005, -0.3], view: [0.16, -0.18, -0.4], vr: [0, 0.035, 0] },
  rpg: { r: [0, -0.02, 0.0], l: [0, -0.02, -0.18], view: [0.17, -0.2, -0.3], vr: [0, 0.03, 0] },
};

function limb(sleeve, skinGlove) {
  const arm = new THREE.Group();
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.55, 12), sleeve);
  fore.position.y = -0.34;
  arm.add(fore);
  // A rounded fist centred on the grip point, so it reads well from any roll around the forearm.
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), skinGlove);
  fist.scale.set(1.05, 1.35, 1.1);
  arm.add(fist);
  const knuckles = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.035, 4, 8), skinGlove);
  knuckles.position.set(0, 0.022, 0);
  knuckles.rotation.z = Math.PI / 2;
  arm.add(knuckles);
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.05, 12), skinGlove);
  wrist.position.y = -0.045;
  arm.add(wrist);
  return arm;
}

// Aims a limb group so its +Y points from `elbow` to the grip point.
function placeLimb(arm, grip, elbow) {
  const dir = new THREE.Vector3().subVectors(grip, elbow);
  arm.position.copy(grip);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
}

export function buildViewmodel(type, sleeveColor) {
  const M = mats();
  const holder = new THREE.Group();
  const weapon = buildWeapon(type);
  const grip = GRIPS[type];
  holder.add(weapon);
  const sleeve = new THREE.MeshStandardMaterial({ color: sleeveColor, roughness: 0.85 });
  const right = limb(sleeve, M.glove);
  placeLimb(right, new THREE.Vector3(...grip.r), new THREE.Vector3(0.14, -0.3, 0.32));
  weapon.add(right);
  if (grip.l) {
    const left = limb(sleeve, M.glove);
    placeLimb(left, new THREE.Vector3(...grip.l), new THREE.Vector3(-0.2, -0.3, 0.1));
    weapon.add(left);
    weapon.userData.parts.leftHand = left;
  }
  holder.position.set(...grip.view);
  weapon.rotation.set(...grip.vr);
  holder.userData.base = new THREE.Vector3(...grip.view);
  holder.userData.weapon = weapon;
  holder.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
  return holder;
}

export function buildShell() {
  return new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.02, 6), mats().brass);
}
