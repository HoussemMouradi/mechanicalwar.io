import * as THREE from 'three';
import { charById, TEAMS, PROPS } from './config.js';
import { buildWeapon, GRIPS } from './weapons.js';
import { buildPropMesh } from './props.js';
import { compactChildren } from './geometry.js';

const HIP_Y = 0.9;
const std = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

function mesh(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  if (s) m.scale.set(...s);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const C = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const S = (r, ws = 16, hs = 12) => new THREE.SphereGeometry(r, ws, hs);

function limbChain(parent, upperMat, lowerMat, endMat, x, y, upperLen, lowerLen, radius, endGeo) {
  const upper = new THREE.Group();
  upper.position.set(x, y, 0);
  parent.add(upper);
  mesh(upper, C(radius, upperLen - radius), upperMat, 0, -upperLen / 2, 0);
  const lower = new THREE.Group();
  lower.position.y = -upperLen;
  upper.add(lower);
  mesh(lower, C(radius * 0.9, lowerLen - radius), lowerMat, 0, -lowerLen / 2, 0);
  const end = new THREE.Group();
  end.position.y = -lowerLen;
  lower.add(end);
  if (endGeo) endGeo(end);
  return { upper, lower, end, upperLen, lowerLen };
}

const _d = new THREE.Vector3(), _q = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(),
  _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Matrix4();

// Two-bone IK in the parent's space: puts the chain end on `target` with the elbow bending towards `pole`.
// Limbs hang along -Y and bend by rotating the lower bone around +X (forearm swings to local -Z).
function reach(chain, target, pole, handOffset = 0.02) {
  const a = chain.upperLen, b = chain.lowerLen + handOffset;
  _d.subVectors(target, chain.upper.position);
  const D = Math.min(Math.max(_d.length(), Math.abs(a - b) + 1e-3), (a + b) * 0.999);
  _d.normalize();
  _q.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  const alpha = Math.acos(THREE.MathUtils.clamp((a * a + D * D - b * b) / (2 * a * D), -1, 1));
  const beta = Math.PI - Math.acos(THREE.MathUtils.clamp((a * a + b * b - D * D) / (2 * a * b), -1, 1));
  _u.copy(_d).multiplyScalar(Math.cos(alpha)).addScaledVector(_q, Math.sin(alpha)).normalize();
  _e.copy(chain.upper.position).addScaledVector(_u, a);
  _w.copy(_d).multiplyScalar(D).add(chain.upper.position).sub(_e).normalize();
  _w.addScaledVector(_u, -_w.dot(_u)).normalize();
  _y.copy(_u).negate();
  _z.copy(_w).negate();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  chain.upper.quaternion.setFromRotationMatrix(_m);
  chain.lower.rotation.set(beta, 0, 0);
  chain.end.rotation.set(0, 0, 0);
}

const POLE_R = new THREE.Vector3(0.7, -1, 0.25), POLE_L = new THREE.Vector3(-0.7, -1, 0.25);

function glasses(head, frameMat, lensMat, dark = false) {
  const g = new THREE.Group();
  g.position.set(0, 0.02, -0.118);
  head.add(g);
  for (const sx of [-0.045, 0.045]) {
    if (dark) mesh(g, B(0.07, 0.035, 0.01), lensMat, sx, 0, 0);
    else {
      mesh(g, new THREE.TorusGeometry(0.028, 0.004, 6, 18), frameMat, sx, 0, 0);
      mesh(g, new THREE.CircleGeometry(0.026, 16), lensMat, sx, 0, 0.001, 0, Math.PI);
    }
  }
  mesh(g, B(0.03, 0.005, 0.006), frameMat, 0, 0.005, 0);
  for (const sx of [-0.08, 0.08]) mesh(g, B(0.005, 0.005, 0.12), frameMat, sx, 0.005, 0.06);
  return g;
}

function buildHead(head, c, skin, def) {
  const hairDark = std(0x2b1d14, 0.7);
  mesh(head, S(0.12, 20, 16), skin, 0, 0, 0, 0, 0, 0, [0.95, 1.08, 1]);
  mesh(head, S(0.028, 8, 6), skin, -0.117, 0.0, 0, 0, 0, 0, [0.5, 1, 0.8]);
  mesh(head, S(0.028, 8, 6), skin, 0.117, 0.0, 0, 0, 0, 0, [0.5, 1, 0.8]);
  mesh(head, B(0.028, 0.045, 0.03), skin, 0, -0.01, -0.12);
  const eyeW = std(0xf5f5f5, 0.3), eyeP = std(0x1a120c, 0.2);
  for (const sx of [-0.042, 0.042]) {
    mesh(head, S(0.016, 10, 8), eyeW, sx, 0.02, -0.103);
    mesh(head, S(0.008, 8, 6), eyeP, sx, 0.02, -0.117);
    if (c.id !== 'manager') mesh(head, B(0.04, 0.008, 0.01), hairDark, sx, 0.05, -0.112, 0, 0, sx > 0 ? -0.12 : 0.12);
  }
  mesh(head, B(0.045, 0.008, 0.01), std(0x6b2c2c, 0.6), 0, -0.055, -0.112);

  switch (c.id) {
    case 'manager': {
      head.children[0].material = std(c.skin, 0.32);
      const grey = std(0x9a9a9a, 0.9);
      mesh(head, B(0.03, 0.06, 0.13), grey, -0.112, 0.01, 0.03);
      mesh(head, B(0.03, 0.06, 0.13), grey, 0.112, 0.01, 0.03);
      mesh(head, B(0.2, 0.06, 0.03), grey, 0, 0.0, 0.112);
      mesh(head, B(0.04, 0.006, 0.01), grey, -0.042, 0.052, -0.112, 0, 0, 0.1);
      mesh(head, B(0.04, 0.006, 0.01), grey, 0.042, 0.052, -0.112, 0, 0, -0.1);
      mesh(head, B(0.06, 0.012, 0.012), grey, 0, -0.04, -0.118);
      glasses(head, std(0x111111, 0.3, 0.6), new THREE.MeshStandardMaterial({ color: 0xbfdcff, transparent: true, opacity: 0.35, roughness: 0.05 }));
      break;
    }
    case 'vape': {
      const cap = std(0xdc2626, 0.7);
      mesh(head, new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.02, 0);
      mesh(head, B(0.16, 0.012, 0.1), cap, 0, 0.03, 0.15);
      mesh(head, S(0.12, 16, 10), std(0x3a2a20, 1), 0, -0.02, -0.005, 0, 0, 0, [0.96, 0.6, 1]).position.y = -0.045;
      const pen = new THREE.Group();
      pen.position.set(0.02, -0.055, -0.13);
      pen.rotation.set(0.1, -0.2, 0);
      head.add(pen);
      mesh(pen, B(0.016, 0.012, 0.07), std(0x2a2a2a, 0.3, 0.8), 0, 0, -0.03);
      mesh(pen, B(0.017, 0.004, 0.01), new THREE.MeshBasicMaterial({ color: 0x22d3ee }), 0, 0.007, -0.05);
      def.vapeOrigin = pen;
      break;
    }
    case 'intern': {
      const hair = std(0x5a3a1e, 0.9);
      mesh(head, new THREE.SphereGeometry(0.126, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), hair, 0, 0.015, 0.005);
      for (let i = 0; i < 9; i++) {
        const a = i * 2.1;
        mesh(head, B(0.05, 0.04, 0.06), hair, Math.cos(a) * 0.06, 0.1 + (i % 3) * 0.01, Math.sin(a) * 0.06, 0.3 * i, a, 0.4);
      }
      break;
    }
    case 'it': {
      const hair = std(0x3b2414, 0.85);
      mesh(head, new THREE.SphereGeometry(0.127, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 0.012, 0.006);
      mesh(head, C(0.03, 0.14), hair, 0, -0.06, 0.14, 0.4);
      mesh(head, S(0.12, 16, 10), hair, 0, -0.07, -0.02, 0, 0, 0, [0.95, 0.62, 0.95]);
      const band = std(0x111111, 0.4, 0.3);
      mesh(head, new THREE.TorusGeometry(0.135, 0.008, 6, 20, Math.PI), band, 0, 0.01, 0, 0, Math.PI / 2, 0);
      for (const sx of [-0.13, 0.13]) mesh(head, new THREE.CylinderGeometry(0.04, 0.04, 0.03, 14), band, sx, 0.0, 0, 0, 0, Math.PI / 2);
      mesh(head, B(0.006, 0.006, 0.1), band, -0.125, -0.04, -0.06, 0.4, 0.3, 0);
      break;
    }
    case 'sales': {
      mesh(head, new THREE.SphereGeometry(0.127, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x120c08, 0.15, 0.2), 0, 0.02, 0.01, -0.15, 0, 0, [1, 1.08, 1.08]);
      glasses(head, std(0x1a1a1a, 0.2, 0.8), std(0x050505, 0.05, 0.9), true);
      break;
    }
    case 'coffee': {
      const hair = std(0x1a0f0a, 0.7);
      mesh(head, new THREE.SphereGeometry(0.128, 16, 10, 0, Math.PI * 2, 0, Math.PI / 1.8), hair, 0, 0.012, 0.008);
      mesh(head, S(0.06, 12, 10), hair, 0, 0.1, 0.09);
      const gold = std(0xd4a017, 0.2, 1);
      for (const sx of [-0.12, 0.12]) mesh(head, S(0.012, 8, 6), gold, sx, -0.04, -0.005);
      head.children.find(m => m.geometry.type === 'BoxGeometry' && m.position.y === -0.055).material = std(0xb91c1c, 0.4);
      break;
    }
  }
}

export class CharacterRig {
  constructor(charId, team) {
    const c = charById(charId);
    this.char = c;
    this.team = team;
    const teamColor = TEAMS[team]?.hex ?? 0x888888;
    const skin = std(c.skin, 0.6), shirt = std(c.shirt, 0.85), sleeve = std(c.sleeve, 0.85),
      pants = std(c.pants, 0.9), shoes = std(c.shoes, 0.5), vest = std(teamColor, 0.75),
      vestDark = std(new THREE.Color(teamColor).multiplyScalar(0.45).getHex(), 0.8), strap = std(0x1a1a1a, 0.7);

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.hips = new THREE.Group();
    this.hips.position.y = HIP_Y;
    this.body.add(this.hips);
    mesh(this.hips, B(0.37, 0.17, 0.23), pants, 0, 0.02, 0);
    mesh(this.hips, B(0.38, 0.035, 0.24), strap, 0, 0.09, 0);

    const shoe = end => {
      mesh(end, B(0.12, 0.075, 0.26), shoes, 0, -0.01, -0.05);
      mesh(end, B(0.125, 0.02, 0.27), std(0x111111, 0.9), 0, -0.045, -0.05);
    };
    const shorts = c.id === 'it';
    this.legL = limbChain(this.hips, pants, shorts ? skin : pants, shoes, -0.1, -0.02, 0.43, 0.43, 0.08, shoe);
    this.legR = limbChain(this.hips, pants, shorts ? skin : pants, shoes, 0.1, -0.02, 0.43, 0.43, 0.08, shoe);

    this.torso = new THREE.Group();
    this.torso.position.y = 0.08;
    this.hips.add(this.torso);
    const chestW = c.id === 'manager' ? 0.46 : 0.42;
    mesh(this.torso, B(chestW - 0.06, 0.16, 0.2), shirt, 0, 0.08, 0);
    mesh(this.torso, B(chestW, 0.42, 0.24), shirt, 0, 0.36, 0);
    if (c.id === 'manager') mesh(this.torso, S(0.2, 16, 12), shirt, 0, 0.12, -0.02, 0, 0, 0, [1.1, 0.75, 0.72]);
    if (c.id === 'sales') mesh(this.torso, B(0.12, 0.08, 0.02), std(0xf8fafc, 0.6), 0, 0.5, -0.12);
    if (c.id === 'manager') mesh(this.torso, B(0.05, 0.14, 0.02), std(0xb91c1c, 0.5), 0, 0.46, -0.13);
    if (c.id === 'vape') mesh(this.torso, new THREE.TorusGeometry(0.12, 0.05, 8, 16), shirt, 0, 0.55, 0.06, Math.PI / 2 + 0.3);

    mesh(this.torso, B(chestW + 0.04, 0.34, 0.07), vest, 0, 0.33, -0.12);
    mesh(this.torso, B(chestW + 0.04, 0.34, 0.07), vest, 0, 0.33, 0.12);
    for (const sx of [-0.14, 0.14]) mesh(this.torso, B(0.06, 0.06, 0.3), vest, sx, 0.52, 0);
    mesh(this.torso, B(chestW + 0.06, 0.07, 0.3), vestDark, 0, 0.18, 0);
    for (const sx of [-0.12, 0, 0.12]) mesh(this.torso, B(0.09, 0.11, 0.05), vestDark, sx, 0.27, -0.17);
    mesh(this.torso, B(0.14, 0.05, 0.012), std(0xffffff, 0.6), 0.1, 0.44, -0.16);
    if (c.id === 'intern') {
      mesh(this.torso, B(0.3, 0.38, 0.14), std(0x1d4ed8, 0.8), 0, 0.32, 0.22);
      mesh(this.torso, B(0.07, 0.1, 0.01), std(0xffffff, 0.5), -0.1, 0.1, -0.13);
      mesh(this.torso, B(0.01, 0.18, 0.01), std(0x2563eb, 0.6), -0.1, 0.22, -0.13);
    }
    if (c.id === 'coffee') {
      mesh(this.torso, new THREE.CylinderGeometry(0.035, 0.03, 0.11, 12), std(0xffffff, 0.4), -0.22, 0.2, -0.05);
      mesh(this.torso, new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12), std(0x7c2d12, 0.6), -0.22, 0.26, -0.05);
    }

    const hand = end => mesh(end, S(0.045, 10, 8), skin, 0, -0.02, 0, 0, 0, 0, [0.9, 1.1, 0.8]);
    this.armL = limbChain(this.torso, sleeve, c.id === 'it' ? skin : sleeve, skin, -chestW / 2 - 0.05, 0.5, 0.31, 0.3, 0.055, hand);
    this.armR = limbChain(this.torso, sleeve, c.id === 'it' ? skin : sleeve, skin, chestW / 2 + 0.05, 0.5, 0.31, 0.3, 0.055, hand);
    for (const arm of [this.armL, this.armR]) mesh(arm.upper, S(0.075, 12, 10), sleeve, 0, -0.02, 0);
    mesh(this.armL.upper, new THREE.CylinderGeometry(0.062, 0.062, 0.06, 12), vest, 0, -0.12, 0);
    if (c.id === 'sales') mesh(this.armR.lower, new THREE.CylinderGeometry(0.052, 0.052, 0.025, 12), std(0xd4a017, 0.2, 1), 0, -0.24, 0);

    this.neck = new THREE.Group();
    this.neck.position.y = 0.58;
    this.torso.add(this.neck);
    mesh(this.neck, new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), skin, 0, 0.04, 0);
    this.head = new THREE.Group();
    this.head.position.y = 0.2;
    this.neck.add(this.head);
    const def = {};
    buildHead(this.head, c, skin, def);
    this.vapeOrigin = def.vapeOrigin || null;

    this.hold = new THREE.Group();
    this.hold.position.set(0.1, 0.36, -0.28);
    this.torso.add(this.hold);

    this.phase = Math.random() * 6;
    this.deadT = 0;
    this.weaponType = null;
    this.propKey = null;
    this.poseArms(null, null);
    compactChildren(this.root);
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // Hands go to the held item's grip points (hold-local), or hang relaxed when nothing is held.
  poseArms(right, left) {
    this.hold.updateMatrix();
    const toTorso = p => p && new THREE.Vector3(...p).applyMatrix4(this.hold.matrix);
    const sx = this.armR.upper.position.x;
    reach(this.armR, toTorso(right) || new THREE.Vector3(sx + 0.04, -0.05, -0.06), POLE_R);
    reach(this.armL, toTorso(left) || new THREE.Vector3(-sx - 0.04, -0.05, -0.06), POLE_L);
  }

  setWeapon(type) {
    if (this.weaponType === type && !this.propKey) return;
    this.weaponType = type;
    this.propKey = null;
    this.hold.clear();
    this.muzzle = null;
    if (!type) { this.poseArms(null, null); return; }
    const w = buildWeapon(type);
    w.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.hold.add(w);
    this.muzzle = w.userData.parts.muzzle;
    const g = GRIPS[type];
    if (type === 'knife') {
      this.hold.position.set(0.24, 0.12, -0.3);
      this.hold.rotation.set(0.5, 0, 0);
      this.poseArms(g.r, null);
    } else if (type === 'glock') {
      this.hold.position.set(0.02, 0.4, -0.44);
      this.hold.rotation.set(0, 0.06, 0);
      this.poseArms(g.r, g.l);
    } else if (type === 'rpg') {
      this.hold.position.set(0.17, 0.62, -0.22);
      this.hold.rotation.set(0, 0, 0);
      this.poseArms(g.r, g.l);
    } else {
      this.hold.position.set(0.1, 0.44, -0.2);
      this.hold.rotation.set(0, 0.12, 0);
      this.poseArms(g.r, g.l);
    }
  }

  setProp(type, variant = 0) {
    const key = type + variant;
    if (this.propKey === key) return;
    this.propKey = key;
    this.weaponType = null;
    this.hold.clear();
    const half = PROPS[type]?.half || [0.15, 0.15, 0.15];
    const p = buildPropMesh(type, variant);
    this.hold.position.set(0, 0.34, -0.2 - half[2]);
    this.hold.rotation.set(0, 0, 0);
    this.hold.add(p);
    this.muzzle = null;
    const hx = Math.min(half[0], 0.26) + 0.03;
    this.poseArms([hx, 0, 0], [-hx, 0, 0]);
  }

  // state: { speed, crouch, pitch, alive, onGround }
  update(dt, st) {
    if (!st.alive) {
      this.deadT = Math.min(1, this.deadT + dt * 2.6);
      const e = 1 - Math.pow(1 - this.deadT, 3);
      this.body.rotation.x = e * 1.5;
      this.body.position.y = e * 0.12;
      this.body.position.z = e * 0.7;
      return;
    }
    this.deadT = 0;
    this.body.rotation.x = 0;
    this.body.position.set(0, 0, 0);
    const moving = st.speed > 0.4;
    this.phase += dt * (moving ? 3 + st.speed * 1.3 : 1.2);
    const swing = moving ? Math.sin(this.phase) * Math.min(0.75, st.speed * 0.14) : 0;
    const crouch = st.crouch ? 1 : 0;
    this.hips.position.y = HIP_Y - crouch * 0.34 + (moving ? Math.abs(Math.cos(this.phase)) * 0.03 : Math.sin(this.phase) * 0.005);
    // Positive X rotation swings a limb forward (-Z); knees bend with negative values.
    this.legL.upper.rotation.x = swing + crouch * 1.1;
    this.legR.upper.rotation.x = -swing + crouch * 1.1;
    this.legL.lower.rotation.x = -Math.max(0, -swing) * 1.1 - crouch * 1.9;
    this.legR.lower.rotation.x = -Math.max(0, swing) * 1.1 - crouch * 1.9;
    this.legL.end.rotation.x = crouch * 0.8;
    this.legR.end.rotation.x = crouch * 0.8;
    if (!st.onGround) { this.legL.upper.rotation.x = 0.6; this.legL.lower.rotation.x = -1.0; this.legR.upper.rotation.x = -0.2; this.legR.lower.rotation.x = -0.4; }
    this.torso.rotation.x = -crouch * 0.2 + st.pitch * 0.45;
    this.head.rotation.x = st.pitch * 0.45;
  }
}
