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
