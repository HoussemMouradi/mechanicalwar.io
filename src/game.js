import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  MAX_HP, RESPAWN_DELAY, SCORE_TO_WIN, TEAMS, WEAPONS, PROPS, QUALITY, charById,
} from './config.js';
import { buildWorld, WALL_H } from './world.js';
import { CharacterRig } from './characters.js';
import { buildWeapon, buildViewmodel } from './weapons.js';
import { buildPropMesh, compactProp, stepProp } from './props.js';
import { Effects } from './fx.js';
import { audio } from './audio.js';
import { Hud, weaponLabel } from './hud.js';
import { Net } from './net.js';
import { Host } from './host.js';
import { setAnisotropy } from './textures.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { SUPPLIES } from './survival.js';
import { buildSupply, disposeSupply, SmokeEffects } from './supplies.js';
import { createOfficeEnvironment, OfficeAOPass, OfficeWorldPass, renderPixelRatio } from './graphics.js';

const RADIUS = 0.3, STAND_H = 1.8, CROUCH_H = 1.25, EYE_STAND = 1.64, EYE_CROUCH = 1.12;
const GRAVITY = 20, JUMP_V = 6.6, STEP = 0.36, RUN_SPEED = 6.0;
const INTERACT_RANGE = 2.5;
const now = () => performance.now();
const v3 = () => new THREE.Vector3();
const _head = new THREE.Vector3();

export class Game {
  constructor({ profile, settings, onStatus, onFail, onPauseChange }) {
    this.profile = profile;
    this.settings = settings;
    this.quality = QUALITY[settings.quality] || QUALITY.high;
    this.onStatus = onStatus || (() => {});
    this.onFail = onFail || (() => {});
    this.onPauseChange = onPauseChange || (() => {});
    this.me = {
      id: 'p_' + Math.random().toString(36).slice(2, 10), name: profile.name, team: profile.team, char: profile.char,
      pos: v3(), vel: v3(), yaw: 0, pitch: 0, onGround: true, crouch: 0, crouching: false,
      hp: MAX_HP, armor: null, helmet: null, boost: 0, bag: { bandage: 0, firstaid: 0, energy: 0, frag: 0, smoke: 0 }, using: null, alive: true, kills: 0, deaths: 0, diedAt: 0, killer: null,
      inv: this.freshInventory(), slot: 'secondary', prevSlot: 'melee', prop: null,
    };
    this.remotes = new Map();
    this.guns = new Map();
    this.props = new Map();
    this.supplies = new Map();
    this.grenades = new Map();
    this.rockets = [];
    this.score = { 1: 0, 2: 0 };
    this.keys = new Set();
    this.mouse = { left: false, right: false, dx: 0, dy: 0 };
    this.wep = { cd: 0, reloadT: 0, reloadDur: 0, drawT: 0, shots: 0, lastShot: 0, scoped: false, fired: false, charge: 0, slashT: 0, boltT: 0, slideT: 0 };
    this.recoil = { x: 0, y: 0 };
    this.kick = { z: 0, rx: 0 };
    this.sway = { x: 0, y: 0 };
    this.shake = 0;
    this.bobT = 0;
    this.stepDist = 0;
    this.camY = EYE_STAND;
    this.paused = false;
    this.ready = false;
    this.leaving = false;
    this.lastVape = now();
  }

  freshInventory() {
    return { primary: null, secondary: { type: 'glock', ammo: WEAPONS.glock.mag, res: WEAPONS.glock.reserve }, melee: { type: 'knife' } };
  }

  /* ================= setup ================= */

  async start() {
    this.initRenderer();
    this.world = buildWorld(this.scene, this.quality);
    this.hud = new Hud(this.world);
    this.fx = new Effects(this.scene);
    this.smokeEffects = new SmokeEffects(this.scene);
    audio.setVolume(this.settings.volume);
    this.bindInput();
    this.buildViewmodel();
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.net = new Net();
    this.net.on('message', (msg, from) => this.onNet(msg, from));
    this.net.on('peerLeft', id => this.host?.removePlayer(id));
    this.net.on('hostLost', () => this.onHostLost());
    await this.connectAndJoin(null);
    this.startTicker();
  }

  initRenderer() {
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: q.aa, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(renderPixelRatio(q, innerWidth, innerHeight, devicePixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'game';
    document.body.prepend(this.renderer.domElement);
    setAnisotropy(Math.min(q.anisotropy, this.renderer.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9cb8d0);
    this.environmentTarget = createOfficeEnvironment(this.renderer);
    this.envMap = this.environmentTarget.texture;
    this.scene.environment = this.envMap;

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.viewScene = new THREE.Scene();
    this.viewScene.environment = this.envMap;
    this.viewCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight(0xf2f5ff, 0x3a3632, 1.1));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
    key.position.set(0.6, 1, 0.4);
    this.viewScene.add(key);
    const rim = new THREE.DirectionalLight(0x9cc3ff, 0.8);
    rim.position.set(-1, 0.3, -0.6);
    this.viewScene.add(rim);

    // HDR/AO needs renderable half floats. Older/mobile GPUs retain the direct
    // renderer, materials and native AA rather than failing to enter a match.
    if (q.post && this.renderer.capabilities.isWebGL2 && this.renderer.extensions.has('EXT_color_buffer_float')) {
      const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: Math.min(4, this.renderer.capabilities.maxSamples) });
      this.composer = new EffectComposer(this.renderer, rt);
      this.composer.addPass(new OfficeWorldPass(this.scene, this.camera));
      this.aoPass = new OfficeAOPass(this.scene, this.camera, q);
      this.composer.addPass(this.aoPass);
      this.composer.addPass(new OfficeWorldPass(this.scene, this.camera, true));
      // Bloom belongs to bright fixtures/screens, before hands and gun are drawn.
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.12, 0.45, 1.05));
      const vp = new RenderPass(this.viewScene, this.viewCamera);
      vp.clear = false;
      vp.clearDepth = true;
      this.composer.addPass(vp);
      this.composer.addPass(new OutputPass());
      this.composer.setSize(innerWidth, innerHeight);
    } else {
      this.renderer.autoClear = false;
    }
    this.onResize = () => {
      this.camera.aspect = this.viewCamera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.viewCamera.updateProjectionMatrix();
      const ratio = renderPixelRatio(q, innerWidth, innerHeight, devicePixelRatio);
      this.renderer.setPixelRatio(ratio);
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer?.setPixelRatio(ratio);
      this.composer?.setSize(innerWidth, innerHeight);
    };
    addEventListener('resize', this.onResize);
  }

  startTicker() {
    // Worker timers keep the host simulating and broadcasting when its tab is in the background.
    const src = 'setInterval(() => postMessage(0), 50);';
    let last = now();
    const tick = () => {
      const t = now(), dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      this.netTick(dt);
    };
    try {
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = tick;
    } catch {
      this.tickTimer = setInterval(tick, 50);
    }
  }

  async connectAndJoin(rejoin) {
    this.onStatus('Connecting to the office...');
    const role = await this.net.connect(s => this.onStatus(s));
    this.role = role;
    const info = { id: this.me.id, name: this.me.name, team: this.me.team, char: this.me.char };
    if (role === 'host' || role === 'offline') {
      this.host = new Host(this);
      this.host.handle(this.me.id, { type: 'join', player: info, rejoin });
      if (role === 'offline') this.hud.toast('Multiplayer server unreachable - offline practice mode', 6000);
    } else {
      this.host = null;
      this.net.send({ type: 'join', player: info, rejoin });
      clearTimeout(this.welcomeTimer);
      this.welcomeTimer = setTimeout(() => {
        if (!this.ready) this.onFail('The office did not answer. Try again in a moment.');
      }, 9000);
    }
    this.hud.netBadge(role === 'host' ? 'HOST' : role === 'client' ? 'ONLINE' : 'OFFLINE');
  }

  onHostLost() {
    if (this.leaving) return;
    this.ready = false;
    this.hud.banner('<b>Host left the office</b><small>Re-electing a new host...</small>', 3000);
    const rejoin = {
      x: this.me.pos.x, y: this.me.pos.y, z: this.me.pos.z, yaw: this.me.yaw,
      primary: this.me.inv.primary && { type: this.me.inv.primary.type, ammo: this.me.inv.primary.ammo, res: this.me.inv.primary.res },
    };
    this.net.close();
    this.clearWorldState();
    setTimeout(() => this.connectAndJoin(this.me.alive ? rejoin : null), 250 + Math.random() * 1200);
  }

  clearWorldState() {
    for (const r of this.remotes.values()) this.scene.remove(r.rig.root);
    this.remotes.clear();
    for (const g of this.guns.values()) this.scene.remove(g.mesh);
    this.guns.clear();
    for (const p of this.props.values()) this.scene.remove(p.mesh);
    this.props.clear();
    this.clearSupplies();
    if (this.me.inv.primary) this.me.inv.primary.gunId = null;
    if (this.me.prop) { this.me.prop = null; if (this.me.slot === 'prop') this.equip('secondary', true); }
  }

  request(msg) {
    if (this.host) this.host.handle(this.me.id, msg);
    else this.net.send(msg);
  }

  netTick(dt) {
    if (this.host) this.host.tick(dt);
    else if (this.ready) this.net.send({ type: 'st', ...this.localState() });
  }

  localState() {
    const m = this.me, p = m.inv.primary;
    return {
      x: m.pos.x, y: m.pos.y, z: m.pos.z, yaw: m.yaw, pitch: m.pitch, cr: m.crouching ? 1 : 0,
      w: m.slot === 'prop' ? 'prop' : this.curType(), mv: Math.hypot(m.vel.x, m.vel.z), g: m.onGround ? 1 : 0,
      pa: p ? p.ammo : 0, pr: p ? p.res : 0,
    };
  }

  /* ================= input ================= */

  bindInput() {
    const canvas = this.renderer.domElement;
    this.handlers = {
      keydown: e => {
        if (e.code === 'Tab') { e.preventDefault(); this.showBoard = true; }
        if (this.paused || e.repeat) { this.keys.add(e.code); return; }
        this.keys.add(e.code);
        audio.ensure();
        switch (e.code) {
          case 'Digit1': this.equip('primary'); break;
          case 'Digit2': this.equip('secondary'); break;
          case 'Digit3': this.equip('melee'); break;
          case 'Digit4': this.equip('prop'); break;
          case 'KeyR': this.startReload(); break;
          case 'KeyE': this.interact(); break;
          case 'KeyG': this.dropCurrent(); break;
          case 'KeyV': this.request({ type: 'emote' }); break;
          case 'KeyH': this.useSupply(); break;
          case 'KeyB': this.useSupply('energy'); break;
          case 'KeyF': this.throwGrenade('frag'); break;
          case 'KeyX': this.throwGrenade('smoke'); break;
          case 'Space': e.preventDefault(); break;
        }
      },
      keyup: e => {
        this.keys.delete(e.code);
        if (e.code === 'Tab') { e.preventDefault(); this.showBoard = false; }
      },
      mousedown: e => {
        if (document.pointerLockElement !== canvas) return;
        audio.ensure();
        if (e.button === 0) { this.mouse.left = true; this.wep.fired = false; }
        if (e.button === 2) { this.mouse.right = true; this.toggleScope(); }
      },
      mouseup: e => {
        if (e.button === 0) {
          this.mouse.left = false;
          if (this.me.slot === 'prop' && this.wep.charge > 0) this.throwProp(this.wep.charge);
        }
        if (e.button === 2) this.mouse.right = false;
      },
      mousemove: e => {
        if (document.pointerLockElement !== canvas || !this.me.alive) return;
        const k = 0.0022 * this.settings.sensitivity * (this.wep.scoped ? 0.32 : 1);
        this.me.yaw -= e.movementX * k;
        this.me.pitch = Math.max(-1.52, Math.min(1.52, this.me.pitch - e.movementY * k));
        this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
      },
      wheel: e => {
        if (document.pointerLockElement !== canvas) return;
        this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      },
      contextmenu: e => e.preventDefault(),
      pointerlockchange: () => {
        const locked = document.pointerLockElement === canvas;
        if (!locked && !this.leaving) this.setPaused(true);
        if (locked) this.setPaused(false);
      },
      pointerlockerror: () => this.setPaused(true),
      blur: () => { this.keys.clear(); this.mouse.left = false; },
      beforeunload: () => { if (!this.host) this.net?.send({ type: 'leave' }); },
    };
    for (const [evt, fn] of Object.entries(this.handlers)) {
      const target = ['pointerlockchange', 'pointerlockerror'].includes(evt) ? document : window;
      target.addEventListener(evt, fn, evt === 'wheel' ? { passive: true } : undefined);
    }
    canvas.addEventListener('click', () => this.lock());
    if (isTouchDevice()) {
      this.touch = new TouchControls(this);
      document.body.classList.add('touch-mode');
    }
  }

  cycleWeapon(dir) {
    const order = ['primary', 'secondary', 'melee', 'prop'].filter(s => this.hasSlot(s));
    const i = order.indexOf(this.me.slot);
    this.equip(order[(i + dir + order.length) % order.length]);
  }

  touchAction(act, on) {
    if (this.paused && act !== 'pause') return;
    audio.ensure();
    const K = this.keys;
    if (act === 'fire') {
      if (on) { this.mouse.left = true; this.wep.fired = false; return; }
      this.mouse.left = false;
      if (this.me.slot === 'prop' && this.wep.charge > 0) this.throwProp(this.wep.charge);
    } else if (act === 'jump') {
      if (on) K.add('Space'); else K.delete('Space');
    } else if (!on) {
      return;
    } else if (act === 'crouch') {
      if (K.has('ControlLeft')) K.delete('ControlLeft'); else K.add('ControlLeft');
    } else if (act === 'reload') this.startReload();
    else if (act === 'use') this.interact();
    else if (act === 'swap') this.cycleWeapon(1);
    else if (act === 'scope') this.toggleScope();
    else if (act === 'heal') this.useSupply();
    else if (act === 'boost') this.useSupply('energy');
    else if (act === 'frag') this.throwGrenade('frag');
    else if (act === 'smoke') this.throwGrenade('smoke');
    else if (act === 'pause') this.setPaused(true);
  }

  lock() {
    if (this.leaving) return;
    if (this.touch) { this.setPaused(false); return; }
    const el = this.renderer.domElement;
    const plain = () => { try { el.requestPointerLock?.()?.catch?.(() => this.setPaused(true)); } catch { this.setPaused(true); } };
    try {
      const req = el.requestPointerLock?.({ unadjustedMovement: true });
      req?.catch?.(plain);
    } catch { plain(); }
  }

  setPaused(p) {
    if (this.paused === p) return;
    this.paused = p;
    this.keys.clear();
    this.mouse.left = false;
    if (p) this.unscope();
    this.onPauseChange(p);
  }

  applySettings(s) {
    this.settings = s;
    this.camera.fov = this.wep.scoped ? 22 : s.fov;
    this.camera.updateProjectionMatrix();
    audio.setVolume(s.volume);
  }

  /* ================= inventory & weapons ================= */

  hasSlot(s) { return s === 'prop' ? !!this.me.prop : !!this.me.inv[s]; }
  curType() { return this.me.slot === 'prop' ? null : this.me.inv[this.me.slot]?.type || null; }
  curItem() { return this.me.slot === 'prop' ? null : this.me.inv[this.me.slot]; }

  equip(slot, force = false) {
    const m = this.me;
    if (!force && (slot === m.slot || !this.hasSlot(slot) || !m.alive)) return;
    if (m.slot === 'prop' && slot !== 'prop' && m.prop) { this.throwProp(0, true); return this.equip(slot, true); }
    this.wep.reloadT = 0;
    this.unscope();
    if (m.slot !== slot && ['primary', 'secondary', 'melee'].includes(m.slot)) m.prevSlot = m.slot;
    m.slot = slot;
    this.wep.drawT = slot === 'melee' ? 0.3 : 0.45;
    this.wep.shots = 0;
    this.wep.charge = 0;
    this.buildViewmodel();
    this.updateHudWeapon();
  }

  buildViewmodel() {
    if (this.vm) this.viewScene.remove(this.vm);
    this.vm = null;
    const m = this.me;
    if (!m.alive) return;
    if (m.slot === 'prop' && m.prop) {
      const g = new THREE.Group();
      const mesh = compactProp(buildPropMesh(m.prop.type, m.prop.variant));
      const big = PROPS[m.prop.type].heavy;
      mesh.rotation.y = 0.4;
      g.add(mesh);
      g.userData.base = new THREE.Vector3(0.08, big ? -0.55 : -0.3, big ? -1.0 : -0.55);
      g.userData.weapon = mesh;
      g.position.copy(g.userData.base);
      this.vm = g;
    } else {
      const type = this.curType();
      if (!type) return;
      this.vm = buildViewmodel(type, charById(m.char).sleeve);
      const parts = this.vm.userData.weapon.userData.parts;
      for (const p of Object.values(parts)) p.userData.base = p.position.clone();
    }
    this.viewScene.add(this.vm);
  }

  updateHudWeapon() {
    const m = this.me;
    if (m.slot === 'prop' && m.prop) this.hud.setWeapon(PROPS[m.prop.type].name, 0, 0, true);
    else {
      const it = this.curItem();
      if (it) this.hud.setWeapon(WEAPONS[it.type].name, it.ammo, it.res, WEAPONS[it.type].melee);
    }
    const slots = [];
    if (m.inv.primary) slots.push({ key: 1, name: WEAPONS[m.inv.primary.type].name, active: m.slot === 'primary' });
    slots.push({ key: 2, name: WEAPONS[m.inv.secondary.type].name, active: m.slot === 'secondary' });
    slots.push({ key: 3, name: 'Knife', active: m.slot === 'melee' });
    if (m.prop) slots.push({ key: 4, name: PROPS[m.prop.type].name, active: m.slot === 'prop' });
    this.hud.setSlots(slots);
  }

  startReload() {
    const it = this.curItem(), w = it && WEAPONS[it.type];
    if (this.me.using || !w || w.melee || this.wep.reloadT > 0 || it.ammo >= w.mag || it.res <= 0 || !this.me.alive) return;
    this.unscope();
    this.wep.reloadT = this.wep.reloadDur = w.reload;
    audio.reload(it.type);
  }

  finishReload() {
    const it = this.curItem();
    if (!it) return;
    const w = WEAPONS[it.type], got = Math.min(w.mag - it.ammo, it.res);
    it.ammo += got; it.res -= got;
    this.updateHudWeapon();
  }

  toggleScope() {
    if (this.me.using || this.curType() !== 'awp' || this.wep.reloadT > 0 || this.wep.drawT > 0) return;
    this.wep.scoped = !this.wep.scoped;
    this.camera.fov = this.wep.scoped ? 22 : this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.hud.scope(this.wep.scoped);
    audio.click();
  }

  unscope() {
    if (!this.wep.scoped) return;
    this.wep.scoped = false;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.hud.scope(false);
  }

  dropCurrent() {
    const m = this.me;
    if (!m.alive) return;
    if (m.slot === 'prop' && m.prop) return this.throwProp(0, true);
    if (m.slot === 'primary' && m.inv.primary) {
      this.request({ type: 'drop', ammo: m.inv.primary.ammo, res: m.inv.primary.res });
      m.inv.primary = null;
      this.equip('secondary', true);
    }
  }

  forward(out = v3()) {
    return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
  }

  interactTarget() {
    const eye = this.camera.position, fwd = this.forward();
    let best = null, bestScore = -Infinity;
    const consider = (kind, o, y) => {
      const d = new THREE.Vector3(o.x - eye.x, y - eye.y, o.z - eye.z);
      const dist = d.length();
      if (dist > INTERACT_RANGE + 0.6) return;
      const dot = d.normalize().dot(fwd);
      if (dot < 0.9) return;
      if (this.castWorld(eye, d, dist).dist < dist - 0.15) return;
      const score = dot * 4 - dist;
      if (score > bestScore) { bestScore = score; best = { kind, o }; }
    };
    for (const g of this.guns.values()) if (!g.heldBy) consider('gun', g, g.y);
    for (const p of this.props.values()) if (p.state === 'rest') consider('prop', p, p.y);
    for (const s of this.supplies.values()) consider('supply', s, s.y + 0.15);
    return best;
  }

  interact() {
    if (!this.me.alive) return;
    const t = this.interactTarget();
    if (!t) return;
    if (t.kind === 'gun') {
      const cur = this.me.inv.primary;
      this.request({ type: 'pickup', id: t.o.id, ammo: cur?.ammo || 0, res: cur?.res || 0 });
    } else if (t.kind === 'supply') {
      const def = SUPPLIES[t.o.kind], current = this.me[def.category];
      if (current && (current.tier > def.tier || (current.tier === def.tier && current.hp >= def.durability))) {
        this.hud.toast('Your equipped protection is already as good or better.'); return;
      }
      if (def.cap && this.me.bag[t.o.kind] >= def.cap) { this.hud.toast(`${def.name}: carrying capacity reached.`); return; }
      this.request({ type: 'supplyPickup', id: t.o.id });
    }
    else if (!this.me.prop) this.request({ type: 'grab', id: t.o.id });
  }

  useSupply(item = null) {
    const m = this.me;
    if (!m.alive || !this.ready || this.paused) return;
    if (m.using) { this.request({ type: 'cancelUse' }); return; }
    if (!item) item = m.bag.firstaid ? 'firstaid' : 'bandage';
    if (!m.bag[item]) { this.hud.toast(item === 'energy' ? 'Find an energy drink to build boost.' : 'Find a first aid kit or bandages to heal.'); return; }
    if (item !== 'energy' && m.hp >= 75) { this.hud.toast('Medical supplies heal to 75 HP. Boost restores the rest.'); return; }
    if (item === 'energy' && m.boost >= 100) { this.hud.toast('Boost is already full.'); return; }
    this.wep.reloadT = 0;
    this.mouse.left = false;
    this.unscope();
    this.request({ type: 'useSupply', item });
  }

  throwGrenade(kind) {
    const m = this.me;
    if (!m.alive || !this.ready || this.paused || !['frag', 'smoke'].includes(kind)) return;
    if (m.prop) { this.hud.toast('Drop the held prop before throwing a grenade.'); return; }
    if (!m.bag[kind]) { this.hud.toast(`No ${kind === 'frag' ? 'frag' : 'smoke'} grenades. Pick one up with E.`); return; }
    this.unscope();
    this.wep.reloadT = 0;
    this.wep.drawT = 0.45;
    this.kick.rx = 0.3;
    this.request({ type: 'throwGrenade', kind, dir: this.forward().toArray() });
  }

  throwProp(charge, gentle = false) {
    const m = this.me;
    if (!m.prop) return;
    const def = PROPS[m.prop.type], dir = this.forward();
    const speed = gentle ? 2.5 : (7 + 17 * charge) * (def.heavy ? 0.62 : 1);
    const pos = this.camera.position.clone().addScaledVector(dir, 0.6);
    pos.y = Math.max(pos.y, m.pos.y + 0.4);
    const vel = dir.multiplyScalar(speed).add(new THREE.Vector3(m.vel.x * 0.5, gentle ? 0.5 : 1.6, m.vel.z * 0.5));
    this.request({ type: 'throw', id: m.prop.id, p: pos.toArray(), v: vel.toArray(), spin: gentle ? 1 : 6 + Math.random() * 8 });
    if (!gentle) audio.whoosh(null);
    m.prop = null;
    this.wep.charge = 0;
    this.hud.charge(0);
    const back = this.hasSlot(m.prevSlot) ? m.prevSlot : 'secondary';
    m.slot = 'none';
    this.equip(back, true);
  }

  /* ================= shooting ================= */

  spreadNow(w) {
    const m = this.me, speed = Math.hypot(m.vel.x, m.vel.z);
    let s = w.scope ? (this.wep.scoped ? w.scopedSpread : w.spread) : w.spread;
    s += w.moveSpread * Math.min(1, speed / RUN_SPEED) * (speed > 2.4 ? 1 : 0.25);
    if (!m.onGround) s += 0.12;
    if (m.crouching && m.onGround) s *= 0.7;
    if (!w.scope) s += Math.min(this.wep.shots, 12) * 0.0018;
    return s;
  }

  castWorld(o, d, maxD) {
    let best = maxD, normal = null;
    for (const c of this.world.colliders) {
      if (c.glass) continue;
      const hit = rayBox(o, d, c, best);
      if (hit && hit.t < best) { best = hit.t; normal = hit.n; }
    }
    if (d.y < -1e-6) { const t = -o.y / d.y; if (t < best) { best = t; normal = new THREE.Vector3(0, 1, 0); } }
    if (d.y > 1e-6) { const t = (WALL_H - o.y) / d.y; if (t < best) { best = t; normal = new THREE.Vector3(0, -1, 0); } }
    return { dist: best, normal };
  }

  castPlayers(o, d, maxD) {
    let best = null;
    for (const p of this.remotes.values()) {
      if (!p.alive || p.team === this.me.team) continue;
      const hp = p.rig.head.getWorldPosition(_head);
      const th = raySphere(o, d, hp.x, hp.y + 0.01, hp.z, 0.16);
      const bh = p.crouch ? 0.62 : 0.8;
      const tb = rayBox(o, d, { x: p.rx, y: p.ry + bh, z: p.rz, hx: 0.26, hy: bh, hz: 0.26 }, maxD);
      let t = Infinity, head = false;
      if (th < maxD) { t = th; head = true; }
      if (tb && tb.t < t - 0.05) { t = tb.t; head = false; }
      if (t < maxD && (!best || t < best.t)) {
        const hy = o.y + d.y * t;
        best = { p, t, head, legs: !head && hy < p.ry + (p.crouch ? 0.45 : 0.75) };
      }
    }
    return best;
  }

  fire() {
    const m = this.me, type = this.curType(), w = WEAPONS[type], it = this.curItem();
    if (!w) return;
    if (m.using) this.request({ type: 'cancelUse' });
    if (w.melee) return this.slash(w);
    if (it.ammo <= 0) {
      this.wep.fired = true;
      audio.click();
      if (it.res > 0) this.startReload();
      return;
    }
    it.ammo--;
    this.wep.cd = w.rate;
    this.wep.shots++;
    this.wep.lastShot = now();
    this.wep.fired = true;
    const origin = this.camera.position.clone();
    const base = this.forward();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    base.addScaledVector(up, this.recoil.y).addScaledVector(right, this.recoil.x).normalize();

    const hits = new Map(), ends = [];
    const spread = this.spreadNow(w);
    if (w.rocket) {
      this.spawnRocket(origin.clone().addScaledVector(right, 0.15).addScaledVector(up, -0.08), base.clone(), m.id);
      ends.push(origin.clone().addScaledVector(base, 10).toArray().map(r2));
    } else {
      for (let i = 0; i < (w.pellets || 1); i++) {
        const dir = base.clone();
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        dir.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
        const wall = this.castWorld(origin, dir, w.range);
        const target = this.castPlayers(origin, dir, wall.dist);
        let end;
        if (target) {
          end = origin.clone().addScaledVector(dir, target.t);
          const dmg = w.dmg * (target.head ? w.headMult : target.legs ? 0.75 : 1);
          const h = hits.get(target.p.id) || { dmg: 0, head: false };
          h.dmg += dmg; h.head = h.head || target.head;
          hits.set(target.p.id, h);
          this.fx.impact(end, dir, 'flesh');
        } else {
          end = origin.clone().addScaledVector(dir, wall.dist);
          if (wall.normal) { this.fx.impact(end, wall.normal, 'wall'); if (i === 0) audio.bulletImpact(end); }
        }
        if (i < 3) ends.push(end.toArray().map(r2));
        const muzzle = this.muzzleWorld(origin, base, right, up);
        if (i < 3) this.fx.tracer(muzzle, end);
      }
    }
    for (const [id, h] of hits) {
      this.request({ type: 'hit', t: id, w: type, dmg: Math.round(h.dmg), head: h.head });
      this.hud.hitmarker(h.head);
      audio.hit(h.head);
    }
    this.request({ type: 'fire', w: type, o: origin.toArray().map(r2), e: ends });

    const k = w.kick;
    const n = this.wep.shots;
    this.recoil.y += k * 0.0105 * (n < 9 ? 1 : 0.3);
    this.recoil.x += n > 5 ? Math.sin(n * 0.55) * k * 0.009 : (Math.random() - 0.5) * k * 0.004;
    this.recoil.y = Math.min(this.recoil.y, 0.2);
    this.kick.z += 0.02 + k * 0.012;
    this.kick.rx += 0.03 + k * 0.03;
    this.wep.slideT = 1;
    this.shake = Math.max(this.shake, k * 0.004);
    audio.shot(type, null);
    this.fx.muzzleFlash(this.vm?.userData.weapon.userData.parts.muzzle, w.rocket || type === 'nova');
    this.fx.muzzleLight(origin.clone().addScaledVector(base, 0.8));
    if (!w.rocket && type !== 'nova') {
      this.fx.shell(origin.clone().addScaledVector(right, 0.12).addScaledVector(up, -0.08).addScaledVector(base, 0.35), right);
    }
    if (type === 'awp') { this.unscope(); this.wep.boltT = 1; }
    this.updateHudWeapon();
  }

  muzzleWorld(origin, fwd, right, up) {
    return origin.clone().addScaledVector(fwd, 0.6).addScaledVector(right, 0.12).addScaledVector(up, -0.1);
  }

  slash(w) {
    this.wep.cd = w.rate;
    this.wep.slashT = 1;
    this.wep.fired = true;
    audio.knife(null);
    const o = this.camera.position.clone(), d = this.forward();
    const wall = this.castWorld(o, d, w.range);
    const t = this.castPlayers(o, d, wall.dist);
    if (t) {
      const behind = Math.cos(t.p.ryaw - this.me.yaw) > 0.6;
      const dmg = behind ? MAX_HP * 1.2 : w.dmg * (t.head ? w.headMult : 1);
      this.request({ type: 'hit', t: t.p.id, w: 'knife', dmg: Math.round(dmg), head: t.head, back: behind });
      this.hud.hitmarker(t.head);
      audio.hit(t.head);
      this.fx.impact(o.clone().addScaledVector(d, t.t), d, 'flesh');
    } else if (wall.normal && wall.dist < w.range) {
      this.fx.impact(o.clone().addScaledVector(d, wall.dist), wall.normal, 'wall');
    }
  }

  spawnRocket(pos, dir, owner) {
    const g = buildWeapon('rpg').userData.parts.rocket?.clone() || new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x556b2f }));
    const holder = new THREE.Group();
    g.position.set(0, -0.06, 0.7);
    holder.add(g);
    holder.position.copy(pos);
    holder.lookAt(pos.clone().add(dir));
    holder.rotateY(Math.PI);
    this.scene.add(holder);
    this.rockets.push({ mesh: holder, pos: pos.clone(), dir: dir.clone(), owner, life: 0, trail: 0 });
  }

  updateRockets(dt) {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life += dt;
      const step = 42 * dt;
      const wall = this.castWorld(r.pos, r.dir, step);
      let hitPoint = null;
      if (wall.dist < step) hitPoint = r.pos.clone().addScaledVector(r.dir, wall.dist - 0.05);
      if (!hitPoint && r.owner === this.me.id) {
        const t = this.castPlayers(r.pos, r.dir, step + 0.4);
        if (t) hitPoint = r.pos.clone().addScaledVector(r.dir, t.t);
      }
      if (!hitPoint && r.life > 3.5) hitPoint = r.pos.clone();
      if (hitPoint) {
        if (r.owner === this.me.id) this.request({ type: 'blast', p: hitPoint.toArray().map(r2) });
        this.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        continue;
      }
      r.pos.addScaledVector(r.dir, step);
      r.mesh.position.copy(r.pos);
      r.trail += dt;
      if (r.trail > 0.02) { r.trail = 0; this.fx.puff(r.pos.clone(), 0xb8b2a8, 0.18, 0.9); }
    }
  }

  /* ================= network apply ================= */

  onNet(msg, from) {
    if (!msg || typeof msg !== 'object') return;
    if (this.host) this.host.handle(from, msg);
    else if (from === 'host') this.apply(msg);
  }

  addRemote(info) {
    if (info.id === this.me.id || this.remotes.has(info.id)) return this.remotes.get(info.id);
    const rig = new CharacterRig(info.char, info.team);
    this.scene.add(rig.root);
    const r = {
      id: info.id, name: info.name, team: info.team, char: info.char, kills: info.kills || 0, deaths: info.deaths || 0,
      alive: info.alive !== false, hp: info.hp ?? MAX_HP, armor: info.armor || null, helmet: info.helmet || null, boost: info.boost || 0, rig,
      tx: info.x || 0, ty: info.y || 0, tz: info.z || 0, rx: info.x || 0, ry: info.y || 0, rz: info.z || 0,
      yaw: info.yaw || 0, ryaw: info.yaw || 0, pitch: 0, crouch: false, onGround: true, w: 'glock', mv: 0,
      lastFired: 0, stepT: 0, propId: null, vapeT: now() + Math.random() * 5000,
    };
    rig.root.position.set(r.rx, r.ry, r.rz);
    this.remotes.set(r.id, r);
    return r;
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.rig.root);
    this.remotes.delete(id);
  }

  syncGuns(list) {
    const seen = new Set();
    for (const [id, type, x, y, z, heldBy, ammo, res] of list) {
      seen.add(id);
      let g = this.guns.get(id);
      if (!g) {
        const mesh = buildWeapon(type);
        mesh.rotation.set(0, Math.random() * Math.PI * 2, Math.PI / 2);
        const holder = new THREE.Group();
        holder.add(mesh);
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.34, 32), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.35, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = -0.045;
        holder.add(ring);
        this.scene.add(holder);
        g = { id, type, mesh: holder, ring };
        this.guns.set(id, g);
      }
      Object.assign(g, { x, y, z, heldBy, ammo, res });
      g.mesh.position.set(x, y + 0.02, z);
      g.mesh.visible = !heldBy;
    }
    for (const [id, g] of this.guns) if (!seen.has(id)) { this.scene.remove(g.mesh); this.guns.delete(id); }
  }

  applyVitals(state) {
    if (!state) return;
    const m = this.me, previousBag = m.bag, oldArmor = m.armor?.hp || 0, oldHelmet = m.helmet?.hp || 0;
    if (Number.isFinite(state.hp)) m.hp = state.hp;
    m.armor = state.armor || null;
    m.helmet = state.helmet || null;
    m.boost = state.boost || 0;
    m.bag = { bandage: 0, firstaid: 0, energy: 0, frag: 0, smoke: 0, ...state.bag };
    m.using = state.using ? { ...state.using } : null;
    this.vitalsAt = now();
    if (this.ready && (Object.keys(m.bag).some(k => m.bag[k] > (previousBag?.[k] || 0)) || (m.armor?.hp || 0) > oldArmor || (m.helmet?.hp || 0) > oldHelmet)) audio.ui();
    this.hud.setHp(m.hp);
    this.hud.setVitals(m);
  }

  syncSupplies(list = []) {
    const seen = new Set();
    for (const s of list) {
      if (!SUPPLIES[s.kind] || !Array.isArray(s.p)) continue;
      seen.add(s.id);
      let local = this.supplies.get(s.id);
      if (local && local.kind !== s.kind) { disposeSupply(local.mesh); this.supplies.delete(s.id); local = null; }
      if (!local) {
        const mesh = buildSupply(s.kind);
        mesh.rotation.y = Math.sin(String(s.id).length * 2.7) * Math.PI;
        this.scene.add(mesh);
        local = { id: s.id, kind: s.kind, mesh };
        this.supplies.set(s.id, local);
      }
      [local.x, local.y, local.z] = s.p;
      local.mesh.position.set(local.x, Math.max(0.008, local.y - 0.16), local.z);
    }
    for (const [id, s] of this.supplies) if (!seen.has(id)) { disposeSupply(s.mesh); this.supplies.delete(id); }
  }

  syncGrenades(list = []) {
    const seen = new Set();
    for (const s of list) {
      if (!['frag', 'smoke'].includes(s.kind) || !Array.isArray(s.p)) continue;
      seen.add(s.id);
      if (s.smoking) {
        const old = this.grenades.get(s.id);
        if (old) { disposeSupply(old.mesh); this.grenades.delete(s.id); }
        this.smokeEffects.add(s.id, s.p, s.radius, s.remaining);
        continue;
      }
      let local = this.grenades.get(s.id);
      if (!local) {
        const mesh = buildSupply(s.kind, { marker: false });
        mesh.position.set(...s.p); this.scene.add(mesh);
        local = { id: s.id, kind: s.kind, mesh, target: new THREE.Vector3(...s.p) };
        this.grenades.set(s.id, local);
      }
      local.target.set(...s.p); local.v = s.v || [0, 0, 0]; local.remaining = s.remaining;
    }
    for (const [id, s] of this.grenades) if (!seen.has(id)) { disposeSupply(s.mesh); this.grenades.delete(id); }
    for (const id of this.smokeEffects.clouds.keys()) if (!seen.has(id)) this.smokeEffects.remove(id);
  }

  updateSupplies(dt, t) {
    for (const s of this.supplies.values()) {
      const ring = s.mesh.userData.ring;
      if (ring) ring.material.opacity = 0.26 + Math.sin(t * 0.002 + s.x) * 0.12;
    }
    for (const g of this.grenades.values()) {
      g.mesh.position.lerp(g.target, Math.min(1, dt * 24));
      if (Math.hypot(...g.v) > 0.5) { g.mesh.rotation.x += dt * 5; g.mesh.rotation.z += dt * 2.2; }
    }
    const opacity = this.smokeEffects.update(dt, this.camera);
    this.hud.smoke(opacity);
    for (const r of this.remotes.values()) {
      const hidden = this.smokeEffects.obscures(this.camera.position, new THREE.Vector3(r.rx, r.ry + 1, r.rz));
      r.smokeHidden = hidden;
      if (hidden) r.rig.root.visible = false;
    }
  }

  clearSupplies() {
    for (const s of this.supplies.values()) disposeSupply(s.mesh);
    this.supplies.clear();
    for (const g of this.grenades.values()) disposeSupply(g.mesh);
    this.grenades.clear();
    this.smokeEffects?.clear();
    this.hud?.smoke(0);
  }

  syncProps(list) {
    const seen = new Set();
    for (const [id, type, variant, x, y, z, ry, state, heldBy] of list) {
      seen.add(id);
      let p = this.props.get(id);
      if (!p) {
        const mesh = compactProp(buildPropMesh(type, variant));
        this.scene.add(mesh);
        p = { id, type, variant, mesh, vx: 0, vy: 0, vz: 0, spin: 0, rx: 0, rz: 0 };
        this.props.set(id, p);
      }
      Object.assign(p, { x, y, z, ry, state, heldBy, vx: 0, vy: 0, vz: 0, rx: 0, rz: 0 });
      p.mesh.visible = state !== 'held';
      this.placeProp(p);
      if (state === 'held' && heldBy === this.me.id) this.takeProp(p);
    }
    for (const [id, p] of this.props) if (!seen.has(id)) { this.scene.remove(p.mesh); this.props.delete(id); }
  }

  placeProp(p) {
    p.mesh.position.set(p.x, p.y, p.z);
    p.mesh.rotation.set(p.rx, p.ry, p.rz);
  }

  takeProp(p) {
    this.me.prop = { id: p.id, type: p.type, variant: p.variant };
    this.equip('prop', true);
    audio.ui();
  }

  apply(msg) {
    const m = this.me;
    switch (msg.type) {
      case 'welcome': {
        clearTimeout(this.welcomeTimer);
        for (const r of [...this.remotes.keys()]) this.removeRemote(r);
        for (const p of msg.players) if (p.id !== m.id) this.addRemote(p); else { m.kills = p.kills; m.deaths = p.deaths; }
        this.syncGuns(msg.guns);
        this.syncProps(msg.props);
        this.score = msg.score;
        const y = msg.you;
        m.pos.set(y.x, y.y || 0, y.z);
        m.vel.set(0, 0, 0);
        m.yaw = y.yaw; m.pitch = 0;
        if (!m.alive || !this.ready) this.resetLife();
        this.syncSupplies(msg.supplies || []);
        this.syncGrenades(msg.grenades || []);
        this.applyVitals(msg.vitals);
        this.ready = true;
        this.onStatus(null);
        this.updateHudWeapon();
        this.hud.setHp(m.hp);
        const team = TEAMS[m.team];
        this.hud.banner(`<b style="color:${team.color}">${team.name}</b><small>${this.role === 'offline' ? 'Offline practice' : 'Welcome to the office'} - first team to ${SCORE_TO_WIN} eliminations wins</small>`, 3500);
        break;
      }
      case 'reject':
        this.leaving = true;
        this.onFail(msg.reason || 'Could not join.');
        break;
      case 'joined': {
        if (msg.player.id === m.id) break;
        const r = this.addRemote(msg.player);
        if (r) this.hud.toast(`${r.name} joined ${TEAMS[r.team].name} as ${charById(r.char).name}`);
        break;
      }
      case 'left': {
        const r = this.remotes.get(msg.id);
        if (r) this.hud.toast(`${r.name} left the office`);
        this.removeRemote(msg.id);
        break;
      }
      case 'snap':
        for (const state of msg.v || []) {
          if (state.id === m.id) this.applyVitals(state);
          else { const r = this.remotes.get(state.id); if (r) Object.assign(r, { armor: state.armor, helmet: state.helmet, boost: state.boost }); }
        }
        if (msg.grenades) this.syncGrenades(msg.grenades);
        for (const [id, x, y, z, yaw, pitch, flags, w, mv, hp] of msg.s) {
          if (id === m.id) continue;
          const r = this.remotes.get(id);
          if (!r) continue;
          r.tx = x; r.ty = y; r.tz = z; r.yaw = yaw; r.pitch = pitch;
          r.crouch = !!(flags & 1); r.onGround = !!(flags & 4); r.w = w; r.mv = mv; r.hp = hp;
          const alive = !!(flags & 2);
          if (alive && !r.alive) { r.rx = x; r.ry = y; r.rz = z; }
          r.alive = alive;
        }
        break;
      case 'fire': {
        const r = this.remotes.get(msg.by);
        if (!r) break;
        r.lastFired = now();
        const origin = new THREE.Vector3(...msg.o);
        audio.shot(msg.w, origin);
        const muzzle = r.rig.muzzle ? r.rig.muzzle.getWorldPosition(v3()) : origin;
        if (WEAPONS[msg.w]?.melee) break;
        this.fx.muzzleFlash(r.rig.muzzle, msg.w === 'rpg');
        this.fx.muzzleLight(muzzle);
        if (msg.w === 'rpg' && msg.e?.[0]) {
          const dir = new THREE.Vector3(...msg.e[0]).sub(origin).normalize();
          this.spawnRocket(muzzle, dir, msg.by);
        } else {
          for (const e of msg.e || []) {
            const end = new THREE.Vector3(...e);
            this.fx.tracer(muzzle, end);
            const n = end.clone().sub(origin).normalize().negate();
            this.fx.impact(end, n, 'wall');
          }
        }
        break;
      }
      case 'dmg': {
        if (msg.t === m.id) {
          m.hp = msg.hp;
          this.hud.setHp(m.hp);
          audio.hurt();
          this.shake = Math.max(this.shake, 0.012);
          this.recoil.y += 0.01;
          if (msg.from && msg.by !== m.id) {
            const ang = Math.atan2(msg.from[0] - m.pos.x, msg.from[1] - m.pos.z);
            this.hud.damageFrom(-(ang - m.yaw) + Math.PI);
          }
        } else {
          const r = this.remotes.get(msg.t);
          if (r) {
            r.hp = msg.hp;
            if (msg.by !== m.id) this.fx.impact(new THREE.Vector3(r.rx, r.ry + 1.2, r.rz), new THREE.Vector3(0, 1, 0), 'flesh');
          }
        }
        break;
      }
      case 'kill': {
        this.score = msg.score;
        const nameOf = id => (id === m.id ? m : this.remotes.get(id));
        for (const [id, [k, d]] of Object.entries(msg.kd)) { const p = nameOf(id); if (p) { p.kills = k; p.deaths = d; } }
        const victim = nameOf(msg.v), killer = nameOf(msg.k);
        if (victim) this.hud.killfeed(msg.k === msg.v ? null : killer, victim, msg.w, msg.head, msg.k === m.id || msg.v === m.id);
        if (msg.v === m.id) this.die(killer, msg.w, msg.head);
        else {
          const r = this.remotes.get(msg.v);
          if (r) { r.alive = false; r.hp = 0; }
          if (msg.k === m.id) { this.hud.hitmarker(msg.head, true); if (msg.head) audio.hit(true); }
        }
        break;
      }
      case 'spawn': {
        if (msg.id === m.id) this.respawnLocal(msg);
        else {
          const r = this.remotes.get(msg.id);
          if (r) Object.assign(r, { alive: true, hp: MAX_HP, armor: msg.vitals?.armor || null, helmet: msg.vitals?.helmet || null, boost: msg.vitals?.boost || 0, tx: msg.x, ty: msg.y, tz: msg.z, rx: msg.x, ry: msg.y, rz: msg.z, yaw: msg.yaw, ryaw: msg.yaw });
        }
        break;
      }
      case 'supplies': this.syncSupplies(msg.list); break;
      case 'vitals':
        if (msg.to === m.id) this.applyVitals(msg.state);
        else { const r = this.remotes.get(msg.to); if (r && msg.state) Object.assign(r, { hp: msg.state.hp, armor: msg.state.armor, helmet: msg.state.helmet, boost: msg.state.boost }); }
        break;
      case 'grenades': this.syncGrenades(msg.list); break;
      case 'detonate': {
        const g = this.grenades.get(msg.id);
        if (g) { disposeSupply(g.mesh); this.grenades.delete(msg.id); }
        const pos = new THREE.Vector3(...msg.p);
        if (msg.kind === 'smoke') this.smokeEffects.add(msg.id, msg.p, msg.radius, msg.duration);
        else {
          this.fx.explosion(pos); audio.explosion(pos);
          this.shake = Math.max(this.shake, Math.max(0, 0.07 - pos.distanceTo(this.camera.position) * 0.004));
        }
        break;
      }
      case 'supplyMessage': if (!msg.to || msg.to === m.id) this.hud.toast(msg.text); break;
      case 'guns': this.syncGuns(msg.list); break;
      case 'gunGrant': {
        if (msg.to !== m.id) break;
        m.inv.primary = { type: msg.gun, gunId: msg.id, ammo: msg.ammo, res: msg.res };
        this.equip('primary', true);
        audio.ui();
        break;
      }
      case 'propHeld': {
        const p = this.props.get(msg.id);
        if (!p) break;
        p.state = 'held'; p.heldBy = msg.by; p.mesh.visible = false;
        if (msg.by === m.id) this.takeProp(p);
        else { const r = this.remotes.get(msg.by); if (r) r.propId = p.id; }
        break;
      }
      case 'thrown': {
        const p = this.props.get(msg.id);
        if (!p) break;
        for (const r of this.remotes.values()) if (r.propId === p.id) r.propId = null;
        if (m.prop?.id === p.id) { m.prop = null; if (m.slot === 'prop') this.equip(this.hasSlot(m.prevSlot) ? m.prevSlot : 'secondary', true); }
        Object.assign(p, {
          state: 'fly', heldBy: null, x: msg.p[0], y: msg.p[1], z: msg.p[2], vx: msg.v[0], vy: msg.v[1], vz: msg.v[2],
          spin: msg.spin, mine: msg.by === m.id && msg.harmful, hitDone: false, settled: false,
        });
        p.mesh.visible = true;
        this.placeProp(p);
        if (msg.harmful && msg.by !== m.id) audio.whoosh(new THREE.Vector3(...msg.p));
        break;
      }
      case 'propRest': {
        const p = this.props.get(msg.id);
        if (!p) break;
        Object.assign(p, { state: 'rest', x: msg.x, y: msg.y, z: msg.z, ry: msg.ry, rx: 0, rz: 0, vx: 0, vy: 0, vz: 0, mine: false });
        this.placeProp(p);
        break;
      }
      case 'blast': {
        const pos = new THREE.Vector3(...msg.p);
        this.fx.explosion(pos);
        audio.explosion(pos);
        const d = pos.distanceTo(this.camera.position);
        this.shake = Math.max(this.shake, Math.max(0, 0.08 - d * 0.004));
        this.rockets = this.rockets.filter(r => { if (r.owner === msg.by) { this.scene.remove(r.mesh); return false; } return true; });
        this.fx.impact(pos.clone().setY(Math.max(0.01, pos.y)), new THREE.Vector3(0, 1, 0), 'wall');
        break;
      }
      case 'emote': {
        const who = msg.id === m.id ? m : this.remotes.get(msg.id);
        if (!who) break;
        const c = charById(who.char);
        if (msg.id === m.id) {
          this.hud.selfBubble(c.line);
          if (c.id === 'vape') { this.fx.vapor(this.camera.position.clone().addScaledVector(this.forward(), 0.5).add(new THREE.Vector3(0, -0.1, 0)), this.forward(), true); audio.vape(null); }
        } else {
          this.hud.bubble(who.id, c.line);
          if (c.id === 'vape') this.remoteVape(who, true);
        }
        break;
      }
      case 'match': {
        this.score = msg.score;
        if (msg.phase === 'end') {
          const t = TEAMS[msg.winner];
          const won = msg.winner === m.team;
          this.hud.banner(`<b style="color:${t.color}">${t.name} WINS</b><small>${won ? 'Promotion secured.' : 'Your department is being restructured.'} New match in 8s</small>`, 8000);
        } else {
          m.kills = m.deaths = 0;
          for (const r of this.remotes.values()) { r.kills = r.deaths = 0; r.propId = null; }
          m.inv.primary = null;
          m.prop = null;
          if (msg.guns) this.syncGuns(msg.guns);
          if (msg.props) this.syncProps(msg.props);
          this.syncSupplies(msg.supplies || []);
          this.syncGrenades(msg.grenades || []);
          this.hud.banner('<b>NEW MATCH</b><small>Back to work.</small>', 2500);
        }
        break;
      }
    }
  }

  remoteVape(r, big) {
    const origin = r.rig.vapeOrigin;
    if (!origin) return;
    const pos = origin.getWorldPosition(v3());
    const dir = new THREE.Vector3(-Math.sin(r.ryaw), 0.1, -Math.cos(r.ryaw));
    this.fx.vapor(pos, dir, big);
    if (big) audio.vape(pos);
  }

  resetLife() {
    const m = this.me;
    m.hp = MAX_HP; m.alive = true; m.killer = null;
    m.armor = m.helmet = m.using = null; m.boost = 0;
    m.bag = { bandage: 0, firstaid: 0, energy: 0, frag: 0, smoke: 0 };
    this.hud.setVitals(m);
    this.hud.useProgress(null);
    m.inv = this.freshInventory();
    m.prop = null;
    m.slot = 'none';
    this.equip('secondary', true);
    this.hud.death(null);
    this.hud.setHp(m.hp);
  }

  die(killer, weapon, head) {
    const m = this.me;
    m.alive = false; m.hp = 0; m.diedAt = now();
    m.using = null; this.hud.useProgress(null);
    m.inv.primary = null; m.prop = null;
    this.unscope();
    this.wep.reloadT = 0;
    this.mouse.left = false;
    this.buildViewmodel();
    this.hud.setHp(0);
    this.hud.charge(0);
    const self = !killer || killer === m;
    this.hud.death({
      killer: self ? 'yourself' : killer.name, color: self ? '#fff' : TEAMS[killer.team].color,
      weapon: weaponLabel(weapon), head,
    });
    this.respawnSent = 0;
  }

  respawnLocal(s) {
    const m = this.me;
    m.pos.set(s.x, s.y || 0, s.z);
    m.vel.set(0, 0, 0);
    m.yaw = s.yaw; m.pitch = 0;
    m.crouching = false; m.crouch = 0;
    this.recoil.x = this.recoil.y = 0;
    this.resetLife();
    this.applyVitals(s.vitals);
  }

  /* ================= simulation ================= */

  overlaps(x, y, z, h) {
    for (const c of this.world.colliders) {
      if (Math.abs(x - c.x) < RADIUS + c.hx && Math.abs(z - c.z) < RADIUS + c.hz && y < c.y + c.hy - 1e-4 && y + h > c.y - c.hy + 1e-4) return c;
    }
    return null;
  }

  movePlayer(dt) {
    const m = this.me, K = this.keys;
    const f = new THREE.Vector3(-Math.sin(m.yaw), 0, -Math.cos(m.yaw));
    const r = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw));
    const wish = new THREE.Vector3();
    if (K.has('KeyW') || K.has('ArrowUp')) wish.add(f);
    if (K.has('KeyS') || K.has('ArrowDown')) wish.sub(f);
    if (K.has('KeyD') || K.has('ArrowRight')) wish.add(r);
    if (K.has('KeyA') || K.has('ArrowLeft')) wish.sub(r);
    let analog = 1;
    if (this.touch && (this.touch.move.x || this.touch.move.z)) {
      wish.addScaledVector(f, -this.touch.move.z).addScaledVector(r, this.touch.move.x);
      analog = Math.min(1, wish.length());
    }
    if (wish.lengthSq()) wish.normalize().multiplyScalar(analog);

    const wantCrouch = K.has('ControlLeft') || K.has('KeyC') || K.has('ControlRight');
    if (wantCrouch && !m.crouching) {
      m.crouching = true;
      if (!m.onGround && !this.overlaps(m.pos.x, m.pos.y + (STAND_H - CROUCH_H), m.pos.z, CROUCH_H)) m.pos.y += STAND_H - CROUCH_H;
    } else if (!wantCrouch && m.crouching) {
      if (m.onGround) {
        if (!this.overlaps(m.pos.x, m.pos.y, m.pos.z, STAND_H)) m.crouching = false;
      } else {
        const ny = Math.max(0, m.pos.y - (STAND_H - CROUCH_H));
        if (!this.overlaps(m.pos.x, ny, m.pos.z, STAND_H)) { m.pos.y = ny; m.crouching = false; }
        else if (!this.overlaps(m.pos.x, m.pos.y, m.pos.z, STAND_H)) m.crouching = false;
      }
    }
    m.crouch += ((m.crouching ? 1 : 0) - m.crouch) * Math.min(1, dt * 12);

    const w = WEAPONS[this.curType()];
    let max = RUN_SPEED * (w?.speed || 1);
    if (m.prop) max *= PROPS[m.prop.type].carrySpeed;
    if (K.has('ShiftLeft') || K.has('ShiftRight')) max *= 0.52;
    if (m.crouching && m.onGround) max *= 0.36;
    if (this.wep.scoped) max *= 0.6;

    if (m.onGround) {
      const accel = wish.lengthSq() ? 11 : 9;
      const t = Math.min(1, accel * dt);
      m.vel.x += (wish.x * max - m.vel.x) * t;
      m.vel.z += (wish.z * max - m.vel.z) * t;
      if (K.has('Space')) { m.vel.y = JUMP_V; m.onGround = false; this.jumped = true; }
    } else {
      const cur = Math.hypot(m.vel.x, m.vel.z);
      m.vel.x += wish.x * max * 2.2 * dt;
      m.vel.z += wish.z * max * 2.2 * dt;
      const nh = Math.hypot(m.vel.x, m.vel.z), cap = Math.max(cur, max);
      if (nh > cap) { m.vel.x *= cap / nh; m.vel.z *= cap / nh; }
    }
    m.vel.y -= GRAVITY * dt;

    const h = m.crouching ? CROUCH_H : STAND_H;
    const wasGround = m.onGround, fallV = m.vel.y;
    const stepUp = (c) => {
      const top = c.y + c.hy, rise = top - m.pos.y;
      if (wasGround && rise > 0 && rise <= STEP && !this.overlaps(m.pos.x, top + 0.001, m.pos.z, h)) { m.pos.y = top + 0.001; return true; }
      return false;
    };
    m.pos.x += m.vel.x * dt;
    let c;
    while ((c = this.overlaps(m.pos.x, m.pos.y, m.pos.z, h))) {
      if (stepUp(c)) continue;
      m.pos.x = m.pos.x > c.x ? c.x + c.hx + RADIUS + 1e-3 : c.x - c.hx - RADIUS - 1e-3;
      m.vel.x = 0;
      break;
    }
    m.pos.z += m.vel.z * dt;
    while ((c = this.overlaps(m.pos.x, m.pos.y, m.pos.z, h))) {
      if (stepUp(c)) continue;
      m.pos.z = m.pos.z > c.z ? c.z + c.hz + RADIUS + 1e-3 : c.z - c.hz - RADIUS - 1e-3;
      m.vel.z = 0;
      break;
    }
    m.pos.y += m.vel.y * dt;
    m.onGround = false;
    if ((c = this.overlaps(m.pos.x, m.pos.y, m.pos.z, h))) {
      if (m.vel.y <= 0) { m.pos.y = c.y + c.hy; m.onGround = true; }
      else m.pos.y = c.y - c.hy - h - 1e-3;
      m.vel.y = 0;
    }
    if (m.pos.y <= 0) { m.pos.y = 0; m.vel.y = 0; m.onGround = true; }
    if (m.pos.y + h > WALL_H) { m.pos.y = WALL_H - h; m.vel.y = Math.min(0, m.vel.y); }
    const b = this.world.bounds;
    m.pos.x = Math.max(b.minX + 0.5, Math.min(b.maxX - 0.5, m.pos.x));
    m.pos.z = Math.max(b.minZ + 0.5, Math.min(b.maxZ - 0.5, m.pos.z));

    if (m.onGround && !wasGround && fallV < -6) { audio.land(null); this.kick.z += 0.02; this.camDip = 0.12; }
    const speed = Math.hypot(m.vel.x, m.vel.z);
    if (m.onGround && speed > 3.3) {
      this.stepDist += speed * dt;
      if (this.stepDist > 2.2) { this.stepDist = 0; audio.step(null, this.surfaceAt(m.pos.x, m.pos.z)); }
    }
  }

  surfaceAt(x, z) {
    if (x < -28 || (x > 6 && x < 24 && z > 15) || (x > -24 && x < -6 && z > 15)) return 'hard';
    return 'carpet';
  }

  updateWeapon(dt) {
    const wp = this.wep, m = this.me;
    wp.cd = Math.max(0, wp.cd - dt);
    wp.drawT = Math.max(0, wp.drawT - dt);
    wp.slashT = Math.max(0, wp.slashT - dt * 3.2);
    wp.boltT = Math.max(0, wp.boltT - dt * 1.1);
    wp.slideT = Math.max(0, wp.slideT - dt * 14);
    if (wp.reloadT > 0) {
      wp.reloadT -= dt;
      this.hud.reload(1 - wp.reloadT / wp.reloadDur);
      if (wp.reloadT <= 0) { wp.reloadT = 0; this.finishReload(); this.hud.reload(null); }
    } else this.hud.reload(null);
    if (now() - wp.lastShot > 260) wp.shots = Math.max(0, wp.shots - dt * 18);
    const rec = Math.min(1, dt * (now() - wp.lastShot > 120 ? 7 : 1.6));
    this.recoil.x -= this.recoil.x * rec;
    this.recoil.y -= this.recoil.y * rec;
    if (!m.alive || this.paused || !this.ready) return;
    if (m.using) {
      if (this.mouse.left) { this.request({ type: 'cancelUse' }); m.using = null; }
      else return;
    }

    if (m.slot === 'prop') {
      if (this.mouse.left && m.prop) {
        wp.charge = Math.min(1, wp.charge + dt / 0.8);
        this.hud.charge(wp.charge);
      }
      return;
    }
    const w = WEAPONS[this.curType()];
    if (!w || wp.drawT > 0 || wp.reloadT > 0 || wp.cd > 0) return;
    if (this.mouse.left && (w.auto || !wp.fired)) this.fire();
  }

  updateRemotes(dt, t) {
    for (const r of this.remotes.values()) {
      const k = Math.min(1, dt * 14);
      const moved = Math.hypot(r.tx - r.rx, r.tz - r.rz);
      if (moved > 6) { r.rx = r.tx; r.ry = r.ty; r.rz = r.tz; }
      r.rx += (r.tx - r.rx) * k; r.ry += (r.ty - r.ry) * k; r.rz += (r.tz - r.rz) * k;
      let dy = r.yaw - r.ryaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.ryaw += dy * Math.min(1, dt * 16);
      r.rig.root.position.set(r.rx, r.ry, r.rz);
      r.rig.root.rotation.y = r.ryaw;
      if (r.propId && this.props.get(r.propId)) { const p = this.props.get(r.propId); r.rig.setProp(p.type, p.variant); }
      else r.rig.setWeapon(WEAPONS[r.w] ? r.w : 'glock');
      r.rig.update(dt, { speed: r.mv, crouch: r.crouch, pitch: r.pitch, alive: r.alive, onGround: r.onGround });
      if (!r.alive && !r.deadAt) r.deadAt = now();
      if (r.alive) r.deadAt = 0;
      r.rig.root.visible = r.alive || now() - r.deadAt < 6000;
      if (r.alive && r.onGround && r.mv > 3.3) {
        r.stepT += r.mv * dt;
        if (r.stepT > 2.2) { r.stepT = 0; audio.step(new THREE.Vector3(r.rx, r.ry, r.rz), this.surfaceAt(r.rx, r.rz)); }
      }
      if (r.alive && r.char === 'vape' && t > r.vapeT) { r.vapeT = t + 5000 + Math.random() * 5000; this.remoteVape(r, false); }
    }
  }

  updateProps(dt) {
    for (const p of this.props.values()) {
      if (p.state !== 'fly' || p.settled) continue;
      const steps = Math.ceil(dt / (1 / 120)), h = dt / steps;
      for (let i = 0; i < steps; i++) {
        p.bounced = false;
        const speed = Math.hypot(p.vx, p.vy, p.vz);
        if (stepProp(p, h, this.world.colliders, this.world.bounds)) { p.settled = true; break; }
        if (p.bounced && speed > 4) audio.impact(new THREE.Vector3(p.x, p.y, p.z), PROPS[p.type].heavy || speed > 12);
        if (p.mine && !p.hitDone && speed > 3) this.propHitCheck(p, speed);
      }
      this.placeProp(p);
    }
  }

  propHitCheck(p, speed) {
    const reach = 0.32 + Math.max(...PROPS[p.type].half);
    for (const r of this.remotes.values()) {
      if (!r.alive || r.team === this.me.team) continue;
      const top = r.ry + (r.crouch ? 1.3 : 1.8);
      const cy = Math.max(r.ry + 0.2, Math.min(top - 0.2, p.y));
      if (Math.hypot(p.x - r.rx, p.y - cy, p.z - r.rz) > reach) continue;
      p.hitDone = true;
      const head = p.y > top - 0.35;
      const dmg = PROPS[p.type].dmg * Math.max(0.45, Math.min(1.3, speed / 17)) * (head ? 1.3 : 1);
      this.request({ type: 'hit', t: r.id, pid: p.id, w: 'prop', dmg: Math.round(dmg), head });
      this.hud.hitmarker(head);
      audio.hit(head);
      audio.impact(new THREE.Vector3(p.x, p.y, p.z), true);
      this.fx.impact(new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(0, 1, 0), 'flesh');
      p.vx *= -0.2; p.vz *= -0.2;
      return;
    }
  }

  updateCamera(dt) {
    const m = this.me, cam = this.camera;
    if (m.alive) {
      const eye = EYE_STAND + (EYE_CROUCH - EYE_STAND) * m.crouch;
      this.camY += (m.pos.y + eye - this.camY) * Math.min(1, dt * (m.onGround ? 18 : 60));
      if (Math.abs(m.pos.y + eye - this.camY) > 0.8) this.camY = m.pos.y + eye;
      this.camDip = Math.max(0, (this.camDip || 0) - dt * 0.8);
      cam.position.set(m.pos.x, this.camY - this.camDip * 0.5, m.pos.z);
      cam.rotation.set(m.pitch + this.recoil.y * 0.55, m.yaw - this.recoil.x * 0.55, 0);
    } else {
      const k = Math.min(1, (now() - m.diedAt) / 700);
      cam.position.set(m.pos.x, m.pos.y + EYE_STAND - k * 1.3, m.pos.z);
      cam.rotation.set(m.pitch * (1 - k) - k * 0.4, m.yaw, k * 0.5);
    }
    if (this.shake > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      cam.rotation.z += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake = Math.max(0, this.shake - dt * 0.12);
    }
    cam.updateMatrixWorld();
    audio.setListener(cam.position, this.forward());
  }

  updateViewmodel(dt) {
    const vm = this.vm;
    if (!vm) return;
    vm.visible = !this.wep.scoped && this.me.alive;
    const wp = this.wep, m = this.me, base = vm.userData.base, weapon = vm.userData.weapon;
    const parts = weapon.userData.parts || {};
    const speed = m.onGround ? Math.hypot(m.vel.x, m.vel.z) : 0;
    this.bobT += dt * (4 + speed * 1.4);
    const bobAmt = Math.min(1, speed / RUN_SPEED);
    const tx = Math.max(-0.04, Math.min(0.04, -this.mouse.dx * 0.00035));
    const ty = Math.max(-0.04, Math.min(0.04, this.mouse.dy * 0.00035));
    this.mouse.dx = this.mouse.dy = 0;
    this.sway.x += (tx - this.sway.x) * Math.min(1, dt * 8);
    this.sway.y += (ty - this.sway.y) * Math.min(1, dt * 8);
    this.kick.z -= this.kick.z * Math.min(1, dt * 14);
    this.kick.rx -= this.kick.rx * Math.min(1, dt * 12);

    const draw = wp.drawT > 0 ? Math.pow(wp.drawT / 0.45, 2) : 0;
    let reloadTilt = 0, p = 0;
    if (wp.reloadT > 0) { p = 1 - wp.reloadT / wp.reloadDur; reloadTilt = Math.sin(Math.min(1, p * 1.15) * Math.PI); }
    const charge = m.slot === 'prop' ? wp.charge : 0;
    const useLower = m.using ? 0.22 : 0;
    vm.position.set(
      base.x + this.sway.x + Math.sin(this.bobT) * 0.012 * bobAmt,
      base.y + this.sway.y - Math.abs(Math.cos(this.bobT)) * 0.012 * bobAmt - draw * 0.25 - reloadTilt * 0.04 - m.crouch * 0.01 + charge * 0.05 - useLower,
      base.z + this.kick.z + charge * 0.18,
    );
    let rx = this.kick.rx - draw * 0.9 + reloadTilt * 0.35 - charge * 0.3, ry = this.sway.x * 2, rz = reloadTilt * 0.55;
    if (wp.slashT > 0) { const s = Math.sin((1 - wp.slashT) * Math.PI); ry += s * 1.1; rz -= s * 0.6; rx += s * 0.3; }
    vm.rotation.set(rx, ry, rz);

    if (parts.mag?.userData.base) {
      const mb = parts.mag.userData.base;
      let off = 0;
      if (wp.reloadT > 0) off = p < 0.25 ? 0 : p < 0.45 ? (p - 0.25) / 0.2 : p < 0.6 ? 1 : p < 0.8 ? 1 - (p - 0.6) / 0.2 : 0;
      parts.mag.position.set(mb.x, mb.y - off * 0.22, mb.z + off * 0.05);
    }
    if (parts.rocket) {
      const it = this.curItem();
      parts.rocket.visible = (it?.ammo > 0 && wp.reloadT <= 0) || (wp.reloadT > 0 && p > 0.6);
    }
    if (parts.slide?.userData.base) parts.slide.position.z = parts.slide.userData.base.z + wp.slideT * 0.03;
    if (parts.pump?.userData.base) {
      const pumpT = wp.cd > 0 && this.curType() === 'nova' ? Math.sin(Math.min(1, (WEAPONS.nova.rate - wp.cd) / 0.5) * Math.PI) : 0;
      parts.pump.position.z = parts.pump.userData.base.z + pumpT * 0.08;
    }
    if (parts.bolt?.userData.base) {
      const b = wp.boltT > 0 ? Math.sin((1 - wp.boltT) * Math.PI) : 0;
      parts.bolt.rotation.z = -b * 1.1;
      parts.bolt.position.z = parts.bolt.userData.base.z + Math.max(0, b - 0.3) * 0.09;
    }
  }

  updateHud(t) {
    const m = this.me;
    const spread = WEAPONS[this.curType()] ? this.spreadNow(WEAPONS[this.curType()]) : 0.01;
    this.hud.crosshair(4 + spread * 520 + (m.onGround ? 0 : 6), this.wep.scoped);
    const alive = { 1: m.team === 1 && m.alive ? 1 : 0, 2: m.team === 2 && m.alive ? 1 : 0 };
    for (const r of this.remotes.values()) if (r.alive) alive[r.team]++;
    this.hud.score(this.score, alive);
    this.hud.radar(m, this.remotes, t);
    this.hud.labels(this.camera, m, this.remotes, t);
    this.hud.scoreboard(!!this.showBoard, m, this.remotes, this.score);
    const remaining = m.using ? Math.max(0, m.using.remaining - (t - (this.vitalsAt || t)) / 1000) : 0;
    this.hud.useProgress(m.alive && m.using ? { ...m.using, remaining } : null);

    let prompt = '';
    if (m.alive && this.ready) {
      if (m.slot === 'prop' && m.prop) prompt = `<kbd>LMB</kbd> hold to wind up, release to throw the ${PROPS[m.prop.type].name.toLowerCase()} &nbsp; <kbd>G</kbd> drop`;
      else {
        const target = this.interactTarget();
        if (target?.kind === 'gun') prompt = `<kbd>${this.touch ? 'USE' : 'E'}</kbd> pick up <b>${WEAPONS[target.o.type].name}</b>`;
        else if (target?.kind === 'supply') prompt = `<kbd>${this.touch ? 'USE' : 'E'}</kbd> pick up <b>${SUPPLIES[target.o.kind].label}</b>`;
        else if (target?.kind === 'prop') prompt = m.prop ? 'Hands full' : `<kbd>${this.touch ? 'USE' : 'E'}</kbd> grab <b>${PROPS[target.o.type].name}</b> to throw it`;
      }
    }
    this.hud.prompt(prompt);

    if (m.alive && this.ready) {
      const o = this.camera.position, d = this.forward();
      const wall = this.castWorld(o, d, 60);
      const hit = this.castPlayers(o, d, wall.dist);
      this.hud.enemyName(hit && !hit.p.smokeHidden ? hit.p.name : '');
    } else this.hud.enemyName('');

    if (!m.alive) {
      const left = RESPAWN_DELAY - (t - m.diedAt) / 1000;
      this.hud.respawnIn(Math.max(0, left));
      if (left <= 0 && t - (this.respawnSent || 0) > 1500) { this.respawnSent = t; this.request({ type: 'respawn' }); }
    }
  }

  loop() {
    if (this.disposed) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = now();
    if (this.ready && this.me.alive && !this.paused) this.movePlayer(dt);
    else if (this.ready && this.me.alive) { this.me.vel.x *= 0.8; this.me.vel.z *= 0.8; }
    this.updateWeapon(dt);
    this.updateRemotes(dt, t);
    this.updateProps(dt);
    this.updateRockets(dt);
    this.updateCamera(dt);
    this.updateSupplies(dt, t);
    this.updateViewmodel(dt);
    this.fx.update(dt);
    for (const g of this.guns.values()) if (g.mesh.visible) g.ring.material.opacity = 0.2 + Math.sin(t * 0.004) * 0.12;
    if (this.ready) this.updateHud(t);
    this.render();
  }

  render() {
    if (this.composer) this.composer.render();
    else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      this.renderer.clearDepth();
      this.renderer.render(this.viewScene, this.viewCamera);
    }
  }

  leave() {
    this.leaving = true;
    if (!this.host) this.net?.send({ type: 'leave' });
    setTimeout(() => this.net?.close(), 150);
    this.worker?.terminate();
    clearInterval(this.tickTimer);
    this.touch?.dispose();
    this.clearSupplies();
    document.exitPointerLock?.();
  }
}

function r2(v) { return Math.round(v * 100) / 100; }

function rayBox(o, d, c, maxD) {
  let tmin = 0, tmax = maxD, axis = -1, sign = 0;
  const oc = [o.x, o.y, o.z], dc = [d.x, d.y, d.z], cc = [c.x, c.y, c.z], hc = [c.hx, c.hy, c.hz];
  for (let a = 0; a < 3; a++) {
    const lo = cc[a] - hc[a], hi = cc[a] + hc[a];
    if (Math.abs(dc[a]) < 1e-9) { if (oc[a] < lo || oc[a] > hi) return null; continue; }
    let t1 = (lo - oc[a]) / dc[a], t2 = (hi - oc[a]) / dc[a], s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (axis < 0) return null;
  const n = new THREE.Vector3();
  n.setComponent(axis, sign);
  return { t: tmin, n };
}

function raySphere(o, d, cx, cy, cz, r) {
  const ox = cx - o.x, oy = cy - o.y, oz = cz - o.z;
  const p = ox * d.x + oy * d.y + oz * d.z;
  const d2 = ox * ox + oy * oy + oz * oz - p * p;
  if (p < 0 || d2 > r * r) return Infinity;
  return p - Math.sqrt(r * r - d2);
}
