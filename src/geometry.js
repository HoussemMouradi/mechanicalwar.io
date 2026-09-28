import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// BoxGeometry face order is +x, -x, +y, -y, +z, -z with 4 vertices each.
export function boxGeo(w, h, d, meters = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!meters) return g;
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / meters, uv.getY(i) * dims[f][1] / meters);
    }
  }
  return g;
}

// A small planar chamfer catches light on furniture edges without subdivision
// surfaces or a modelling asset. Dimensions remain identical to the collision box.
export function beveledBoxGeo(w, h, d, bevel = 0.01, meters = 0) {
  const half = [w / 2, h / 2, d / 2];
  const r = Math.min(bevel, ...half.map(v => v * 0.45));
  if (r <= 0) return boxGeo(w, h, d, meters);
  const inset = half.map(v => v - r), positions = [], normals = [], uvs = [], indices = [];
  const add = (points, normal) => {
    const n = new THREE.Vector3(...normal).normalize();
    const ab = new THREE.Vector3().subVectors(new THREE.Vector3(...points[1]), new THREE.Vector3(...points[0]));
    const ac = new THREE.Vector3().subVectors(new THREE.Vector3(...points[2]), new THREE.Vector3(...points[0]));
    if (ab.cross(ac).dot(n) < 0) points.reverse();
    const offset = positions.length / 3;
    const major = normal.map(Math.abs).indexOf(Math.max(...normal.map(Math.abs)));
    const axes = [0, 1, 2].filter(a => a !== major);
    for (const p of points) {
      positions.push(...p); normals.push(n.x, n.y, n.z);
      uvs.push((p[axes[0]] + half[axes[0]]) / (meters || half[axes[0]] * 2), (p[axes[1]] + half[axes[1]]) / (meters || half[axes[1]] * 2));
    }
    for (let i = 1; i < points.length - 1; i++) indices.push(offset, offset + i, offset + i + 1);
  };
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const other = [0, 1, 2].filter(a => a !== axis), n = [0, 0, 0]; n[axis] = sign;
    add([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
      const p = [0, 0, 0]; p[axis] = sign * half[axis]; p[other[0]] = a * inset[other[0]]; p[other[1]] = b * inset[other[1]]; return p;
    }), n);
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
    const c = 3 - a - b, n = [0, 0, 0]; n[a] = sa; n[b] = sb;
    add([[false, -1], [true, -1], [true, 1], [false, 1]].map(([edge, sc]) => {
      const p = [0, 0, 0]; p[a] = sa * (edge ? inset[a] : half[a]); p[b] = sb * (edge ? half[b] : inset[b]); p[c] = sc * inset[c]; return p;
    }), n);
  }
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const signs = [sx, sy, sz];
    add([0, 1, 2].map(axis => signs.map((s, a) => s * (a === axis ? half[a] : inset[a]))), signs);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  return g;
}

export function planeGeo(w, h, meters = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  if (meters) {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / meters, uv.getY(i) * h / meters);
  }
  return g;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpS = new THREE.Vector3(1, 1, 1), tmpP = new THREE.Vector3();
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
  tmpE.set(rx, ry, rz);
  tmpQ.setFromEuler(tmpE);
  tmpP.set(x, y, z);
  if (typeof s === 'number') tmpS.set(s, s, s); else tmpS.set(s[0], s[1], s[2]);
  return tmpM.clone().compose(tmpP, tmpQ, tmpS);
}

function normalise(geo) {
  const g = geo.index ? geo : geo.clone();
  if (!g.index) {
    const n = g.attributes.position.count, idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

// Collects static geometry and merges it into one mesh per material + shadow setting.
export class StaticBatch {
  constructor() { this.groups = new Map(); }

  add(geometry, material, matrix, { cast = true, receive = true } = {}) {
    const key = material.uuid + (cast ? 'c' : '') + (receive ? 'r' : '');
    if (!this.groups.has(key)) this.groups.set(key, { material, cast, receive, geos: [] });
    const g = normalise(geometry).clone();
    g.applyMatrix4(matrix);
    this.groups.get(key).geos.push(g);
  }

  build(parent) {
    const meshes = [];
    for (const { material, cast, receive, geos } of this.groups.values()) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

// Merges the direct mesh children of every node by material, keeping the node
// hierarchy (and therefore animation pivots) intact.
export function compactChildren(root) {
  const nodes = [];
  root.traverse(o => { if (!o.isMesh) nodes.push(o); });
  for (const node of nodes) {
    const meshes = node.children.filter(c => c.isMesh && !c.children.length && !c.name);
    if (meshes.length < 2) continue;
    const byMat = new Map();
    for (const m of meshes) {
      m.updateMatrix();
      if (!byMat.has(m.material.uuid)) byMat.set(m.material.uuid, { mat: m.material, cast: m.castShadow, geos: [] });
      byMat.get(m.material.uuid).geos.push(normalise(m.geometry).clone().applyMatrix4(m.matrix));
      node.remove(m);
    }
    for (const { mat, cast, geos } of byMat.values()) {
      const merged = new THREE.Mesh(mergeGeometries(geos, false), mat);
      merged.castShadow = cast;
      merged.receiveShadow = true;
      node.add(merged);
    }
  }
  return root;
}

export function setShadows(obj, cast = true, receive = true) {
  obj.traverse(o => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return obj;
}
