import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CHARACTERS, TEAMS, FAKE_TEAM, charById } from './config.js';
import { CharacterRig } from './characters.js';
import { audio } from './audio.js';

const $ = id => document.getElementById(id);

export class Menu {
  constructor(profile, onPlay) {
    this.profile = profile;
    this.onPlay = onPlay;
    this.running = true;
    this.initPreview();
    this.renderChars();
    this.bind();
    this.selectTeam(profile.team, true);
    this.selectChar(profile.char, true);
    $('name').value = profile.name;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  initPreview() {
    const canvas = $('preview');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.25, 5.6);
    this.camera.lookAt(0, 0.95, 0);

    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.1, 64), new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.35, metalness: 0.7 }));
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xf5c542 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.012, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.002;
    this.scene.add(ring);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x1a1410, 0.6));
    const key = new THREE.SpotLight(0xfff1dc, 34, 20, 0.5, 0.6, 1.4);
    key.position.set(2.5, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    this.rim = new THREE.SpotLight(0xf5c542, 70, 20, 0.6, 0.7, 1.3);
    this.rim.position.set(-2.5, 3.5, -3.5);
    this.scene.add(this.rim);
    this.rim2 = new THREE.PointLight(0xf5c542, 6, 6, 2);
    this.rim2.position.set(1.8, 0.6, -1.5);
    this.scene.add(this.rim2);

    this.turn = 0;
    this.spin = 0;
    this.resize = () => {
      const w = innerWidth, h = innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      if (w > 900) this.camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
      else this.camera.clearViewOffset();
      this.camera.updateProjectionMatrix();
    };
    this.resize();
    addEventListener('resize', this.resize);
  }

  // Renders a head-and-shoulders portrait of every character for the selection cards.
  renderThumbnails() {
    const team = this.profile.team || 1;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(220, 220);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene();
    scene.environment = this.scene.environment;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.2));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(1, 2, 3);
    scene.add(d);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    cam.position.set(0.35, 1.62, 1.75);
    cam.lookAt(0, 1.5, 0);
    for (const c of CHARACTERS) {
      const rig = new CharacterRig(c.id, team);
      rig.setWeapon(null);
      rig.update(0, { speed: 0, crouch: false, pitch: 0, alive: true, onGround: true });
      rig.root.rotation.y = Math.PI + 0.35;
      scene.add(rig.root);
      r.render(scene, cam);
      const img = document.querySelector(`.char-card[data-char="${c.id}"] img`);
      if (img) img.src = r.domElement.toDataURL('image/png');
      scene.remove(rig.root);
    }
    r.dispose();
    r.forceContextLoss?.();
  }

  renderChars() {
    $('chars').innerHTML = CHARACTERS.map(c => `
      <button class="char-card" data-char="${c.id}">
        <img alt="${c.name}">
        <span class="cc-name">${c.name}</span>
        <span class="cc-tag">${c.tag}</span>
      </button>`).join('');
  }

  bind() {
    for (const card of document.querySelectorAll('.team-card')) {
      card.addEventListener('click', () => {
        audio.ensure();
        if (card.dataset.team === 'rh') return this.denyRH(card);
        this.selectTeam(Number(card.dataset.team));
        audio.ui();
      });
    }
    $('chars').addEventListener('click', e => {
      const card = e.target.closest('.char-card');
      if (!card) return;
      audio.ensure();
      audio.ui();
      this.selectChar(card.dataset.char);
    });
    $('name').addEventListener('input', () => { this.profile.name = $('name').value.trim().slice(0, 18); });
    $('name').addEventListener('keydown', e => { if (e.key === 'Enter') $('play').click(); });
    $('play').addEventListener('click', () => this.play());
  }

  denyRH(card) {
    audio.denied();
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
    const old = $('denied');
    const fresh = old.cloneNode(true);
    fresh.classList.remove('hide');
    old.replaceWith(fresh);
    clearTimeout(this.deniedT);
    this.deniedT = setTimeout(() => $('denied').classList.add('hide'), 2200);
    this.msg(`${FAKE_TEAM.name}: nope, get out`);
  }

  msg(text) { $('menuMsg').textContent = text || ''; }

  selectTeam(team, silent = false) {
    if (!TEAMS[team]) {
      $('charTeam').textContent = 'Pick a department';
      $('charTeam').style.color = '';
      return;
    }
    const changed = this.profile.team !== team;
    this.profile.team = team;
    for (const c of document.querySelectorAll('.team-card')) c.classList.toggle('selected', Number(c.dataset.team) === team);
    const t = TEAMS[team];
    $('charTeam').textContent = `${t.name} - ${t.full}`;
    $('charTeam').style.color = t.color;
    this.ringMat.color.set(t.hex);
    this.rim.color.set(t.hex);
    this.rim2.color.set(t.hex);
    if (!silent) this.msg('');
    if (changed || !this.thumbsDone) { this.thumbsDone = true; this.renderThumbnails(); }
    this.buildRig();
  }

  selectChar(id, silent = false) {
    const c = charById(id);
    this.profile.char = c.id;
    for (const el of document.querySelectorAll('.char-card')) el.classList.toggle('selected', el.dataset.char === c.id);
    $('charName').textContent = c.name;
    $('charTag').textContent = c.tag;
    $('charLine').textContent = `"${c.line}"`;
    if (!silent) this.spin = 1;
    this.buildRig();
    if (!this.thumbsDone) { this.thumbsDone = true; this.renderThumbnails(); }
  }

  buildRig() {
    if (this.rig) this.scene.remove(this.rig.root);
    this.rig = new CharacterRig(this.profile.char, this.profile.team || 0);
    this.rig.setWeapon('ak47');
    this.scene.add(this.rig.root);
  }

  play() {
    audio.ensure();
    let name = $('name').value.trim().slice(0, 18);
    if (!name) {
      name = 'Employee-' + Math.floor(1000 + Math.random() * 9000);
      $('name').value = name;
    }
    this.profile.name = name;
    if (!TEAMS[this.profile.team]) {
      this.msg('Pick a department first: AUTO or DJB.');
      const teams = document.querySelector('.teams');
      teams.classList.remove('nudge');
      void teams.offsetWidth;
      teams.classList.add('nudge');
      teams.scrollIntoView({ behavior: 'smooth', block: 'center' });
      audio.denied();
      return;
    }
    if (!window.Peer) this.msg('Multiplayer library blocked - starting offline practice.');
    this.onPlay({ ...this.profile });
  }

  loop(t) {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    if (this.rig) {
      this.spin = Math.max(0, this.spin - 0.02);
      const ease = this.spin * this.spin * (3 - 2 * this.spin);
      this.rig.root.rotation.y = Math.PI + 0.25 + Math.sin(t * 0.0005) * 0.45 + ease * Math.PI * 2;
      this.rig.update(0.016, { speed: 0, crouch: false, pitch: Math.sin(t * 0.0007) * 0.05, alive: true, onGround: true });
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.running = false;
    removeEventListener('resize', this.resize);
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
  }
}
