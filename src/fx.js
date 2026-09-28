import * as THREE from 'three';
import { TEX } from './textures.js';
import { buildShell } from './weapons.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.decals = [];
    this.decalGeo = new THREE.PlaneGeometry(0.09, 0.09);
    this.decalMat = new THREE.MeshStandardMaterial({
      map: TEX.decal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1,
    });
    this.flashLight = new THREE.PointLight(0xffc36b, 0, 9, 2);
    scene.add(this.flashLight);
    this.flashT = 0;
    this.tracerGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 4, 1, true);
    this.tracerGeo.translate(0, 0.5, 0);
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe7a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  }

  sprite(tex, color, opts = {}) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, color, transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: opts.opacity ?? 1,
    }));
    return m;
  }

  add(obj, life, update) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, update });
  }

  muzzleLight(pos) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 6;
    this.flashT = 0.05;
  }

  // Flash attached to a muzzle marker (viewmodel or third-person model).
  muzzleFlash(parent, big = false) {
    if (!parent) return;
    const s = this.sprite(TEX.flash(), 0xffffff, { additive: true });
    const size = big ? 0.5 : 0.22;
    s.scale.set(size, size, size);
    s.material.rotation = Math.random() * Math.PI;
    parent.add(s);
    const item = { obj: s, life: 0.045, max: 0.045, attached: parent };
    this.items.push(item);
  }

  tracer(from, to) {
    const len = from.distanceTo(to);
    if (len < 1.5) return;
    const m = new THREE.Mesh(this.tracerGeo, this.tracerMat.clone());
    const dir = to.clone().sub(from).normalize();
    m.quaternion.setFromUnitVectors(UP, dir);
    const seg = Math.min(4, len * 0.4);
    m.scale.set(1, seg, 1);
    const speed = 260;
    let travelled = 0.8;
    m.position.copy(from).addScaledVector(dir, travelled);
    this.add(m, len / speed + 0.02, (dt, it) => {
      travelled += speed * dt;
      if (travelled + seg > len) { it.life = 0; return; }
      m.position.copy(from).addScaledVector(dir, travelled);
    });
  }

  impact(point, normal, kind = 'wall') {
    if (kind === 'wall') {
      const d = new THREE.Mesh(this.decalGeo, this.decalMat);
      d.position.copy(point).addScaledVector(normal, 0.004);
      d.lookAt(point.clone().add(normal));
      d.rotation.z = Math.random() * Math.PI * 2;
      d.scale.setScalar(0.7 + Math.random() * 0.5);
      this.scene.add(d);
      this.decals.push(d);
      if (this.decals.length > 140) this.scene.remove(this.decals.shift());
      for (let i = 0; i < 5; i++) this.spark(point, normal);
      this.puff(point.clone().addScaledVector(normal, 0.05), 0xbdb6aa, 0.25, 0.5);
    } else {
      for (let i = 0; i < 3; i++) this.puff(point, 0x8a0e0e, 0.18 + Math.random() * 0.15, 0.35, new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5));
    }
  }

  spark(point, normal) {
    const s = this.sprite(TEX.soft(), 0xffc14d, { additive: true });
    s.scale.setScalar(0.035);
    s.position.copy(point);
    const v = normal.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3));
    this.add(s, 0.25, (dt, it) => {
      v.y -= 12 * dt;
      s.position.addScaledVector(v, dt);
      s.material.opacity = it.life / it.max;
    });
  }

  puff(point, color, size, life, vel = null) {
    const s = this.sprite(TEX.soft(), color, { opacity: 0.8 });
    s.position.copy(point);
    s.scale.setScalar(size);
    const v = vel || new THREE.Vector3(0, 0.3, 0);
    this.add(s, life, (dt, it) => {
      const k = 1 - it.life / it.max;
      s.position.addScaledVector(v, dt);
      s.scale.setScalar(size * (1 + k * 1.8));
      s.material.opacity = 0.8 * (1 - k);
    });
  }

  shell(pos, dir) {
    const m = buildShell();
    m.userData.sharedMaterial = true;
    m.position.copy(pos);
    const v = dir.clone().multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(0, 1.8 + Math.random(), 0));
    const spin = new THREE.Vector3(Math.random() * 20, Math.random() * 20, Math.random() * 20);
    this.add(m, 1.4, (dt) => {
      v.y -= 14 * dt;
      m.position.addScaledVector(v, dt);
      if (m.position.y < 0.01) { m.position.y = 0.01; v.set(v.x * 0.4, Math.abs(v.y) * 0.3, v.z * 0.4); spin.multiplyScalar(0.5); }
      m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
    });
  }

  explosion(pos) {
    const fire = this.sprite(TEX.soft(), 0xff8a2a, { additive: true });
    fire.position.copy(pos);
    this.add(fire, 0.55, (dt, it) => {
      const k = 1 - it.life / it.max;
      fire.scale.setScalar(1 + k * 7);
      fire.material.opacity = 1 - k;
    });
    const core = this.sprite(TEX.flash(), 0xffffff, { additive: true });
    core.position.copy(pos);
    this.add(core, 0.2, (dt, it) => { core.scale.setScalar(3 + (1 - it.life / it.max) * 4); core.material.opacity = it.life / it.max; });
    for (let i = 0; i < 14; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 2.5, (Math.random() - 0.5) * 4);
      this.puff(pos.clone(), 0x2d2a26, 0.9 + Math.random() * 0.8, 1.6 + Math.random(), v);
    }
    for (let i = 0; i < 24; i++) this.spark(pos, new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2).normalize());
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 60;
    this.flashLight.distance = 22;
    this.flashT = 0.2;
  }

  vapor(pos, dir, big = false) {
    const n = big ? 16 : 5;
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(big ? 1.4 + Math.random() : 0.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.5));
      const s = this.sprite(TEX.soft(), 0xf1f5f9, { opacity: 0.7 });
      s.position.copy(pos);
      const size = big ? 0.35 : 0.18;
      s.scale.setScalar(size);
      const life = big ? 3 + Math.random() * 1.5 : 1.6;
      this.add(s, life, (dt, it) => {
        const k = 1 - it.life / it.max;
        v.multiplyScalar(Math.pow(0.4, dt));
        s.position.addScaledVector(v, dt);
        s.scale.setScalar(size * (1 + k * (big ? 6 : 4)));
        s.material.opacity = 0.65 * (1 - k);
      });
    }
  }

  update(dt) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flashLight.intensity = 0; this.flashLight.distance = 9; }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      if (it.life > 0 && it.update) it.update(dt, it);
      if (it.life <= 0) {
        (it.attached || this.scene).remove(it.obj);
        if (!it.obj.userData.sharedMaterial && it.obj.material) it.obj.material.dispose();
        if (it.obj.isMesh && it.obj.geometry !== this.tracerGeo) it.obj.geometry.dispose();
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const it of this.items) (it.attached || this.scene).remove(it.obj);
    this.items = [];
    for (const d of this.decals) this.scene.remove(d);
    this.decals = [];
  }
}
