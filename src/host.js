import { MAX_HP, TEAM_LIMIT, SCORE_TO_WIN, RESPAWN_DELAY, WEAPONS, PROPS, TEAMS, CHARACTERS } from './config.js';
import { stepProp } from './props.js';
import { SUPPLIES, SUPPLY_SPOTS, GRENADE, freshVitals, clearSegment, stepGrenade } from './survival.js';

const PICK_RANGE = 2.8;
const now = () => performance.now();
const r2 = v => Math.round(v * 100) / 100;

// Authoritative match state. Runs only on the hosting peer; every outcome is
// broadcast through `emit`, which also applies it locally on the host.
export class Host {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.players = new Map();
    this.guns = new Map();
    this.props = new Map();
    this.supplies = new Map();
    this.supplyRespawns = new Map();
    this.grenades = new Map();
    this.nextGrenade = 0;
    this.score = { 1: 0, 2: 0 };
    this.phase = 'live';
    this.phaseAt = 0;
    this.seed();
  }

  seed() {
    this.supplies.clear();
    this.supplyRespawns.clear();
    this.grenades.clear();
    SUPPLY_SPOTS.forEach((s, i) => this.supplies.set('s' + i, { id: 's' + i, ...s }));
    this.guns.clear();
    this.world.gunSpots.forEach((s, i) => {
      const w = WEAPONS[s.type];
      this.guns.set('g' + i, { id: 'g' + i, type: s.type, x: s.x, y: s.y, z: s.z, heldBy: null, ammo: w.mag, res: w.reserve });
    });
    this.props.clear();
    this.world.propSpots.forEach((s, i) => {
      this.props.set('p' + i, {
        id: 'p' + i, type: s.type, variant: s.variant, x: s.x, y: s.y, z: s.z, ry: s.ry, rx: 0, rz: 0,
        vx: 0, vy: 0, vz: 0, spin: 0, state: 'rest', heldBy: null, thrownBy: null, thrownAt: 0,
      });
    });
  }

  emit(msg) {
    this.game.net.broadcast(msg);
    this.game.apply(msg);
  }

  gunList() { return [...this.guns.values()].map(g => [g.id, g.type, r2(g.x), r2(g.y), r2(g.z), g.heldBy, g.ammo, g.res]); }
  propList() { return [...this.props.values()].map(p => [p.id, p.type, p.variant, r2(p.x), r2(p.y), r2(p.z), r2(p.ry), p.state, p.heldBy]); }
  supplyList() { return [...this.supplies.values()].map(s => ({ id: s.id, kind: s.kind, p: [s.x, s.y, s.z] })); }
  grenadeList() { return [...this.grenades.values()].map(g => ({ id: g.id, kind: g.kind, p: [r2(g.x), r2(g.y), r2(g.z)], v: [r2(g.vx), r2(g.vy), r2(g.vz)], remaining: r2(g.remaining), smoking: !!g.smoking, radius: GRENADE[g.kind].radius })); }
  vitals(p) {
    return { hp: p.hp, armor: p.armor ? { ...p.armor } : null, helmet: p.helmet ? { ...p.helmet } : null, boost: r2(p.boost), bag: { ...p.bag }, using: p.using ? { item: p.using.item, remaining: r2(Math.max(0, p.using.remaining)) } : null };
  }
  sendVitals(p) { this.emit({ type: 'vitals', to: p.id, state: this.vitals(p) }); }
  meta(p) { return { id: p.id, name: p.name, team: p.team, char: p.char, kills: p.kills, deaths: p.deaths, alive: p.alive, hp: p.hp, x: p.x, y: p.y, z: p.z, yaw: p.yaw, ...this.vitals(p) }; }

  pickSpawn(team) {
    const pool = this.world.spawns[team] || this.world.spawns[1];
    let best = pool[0], bestScore = -Infinity;
    for (const s of pool) {
      let nearest = 99, crowd = 0;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (p.team !== team) nearest = Math.min(nearest, d);
        else if (d < 1.5) crowd++;
      }
      const score = nearest - crowd * 20 + Math.random() * 3;
      if (score > bestScore) { bestScore = score; best = s; }
    }
    return best;
  }

  addPlayer(info, rejoin) {
    const team = Number(info.team);
    if (!TEAMS[team]) return { error: 'Invalid team.' };
    const count = [...this.players.values()].filter(p => p.team === team).length;
    if (count >= TEAM_LIMIT) return { error: `${TEAMS[team].name} is full (${TEAM_LIMIT}/${TEAM_LIMIT}). Pick the other team.` };
    const spawn = rejoin ? { x: rejoin.x, z: rejoin.z, yaw: rejoin.yaw } : this.pickSpawn(team);
    const p = {
      id: info.id, name: String(info.name || 'Employee').slice(0, 18), team,
      char: CHARACTERS.some(c => c.id === info.char) ? info.char : CHARACTERS[0].id,
      x: spawn.x, y: rejoin?.y || 0, z: spawn.z, yaw: spawn.yaw, pitch: 0, cr: 0, w: 'glock', mv: 0, g: 1,
      hp: MAX_HP, alive: true, kills: 0, deaths: 0, gunId: null, primary: null, pa: 0, pr: 0,
      propId: null, diedAt: 0, last: now(), lastShot: 0, lastGrenade: -Infinity,
      ...freshVitals(),
    };
    this.players.set(p.id, p);
    return { player: p };
  }

  welcome(p) {
    return {
      type: 'welcome', you: { id: p.id, x: p.x, y: p.y, z: p.z, yaw: p.yaw },
      players: [...this.players.values()].map(q => this.meta(q)),
      guns: this.gunList(), props: this.propList(), score: this.score, phase: this.phase,
      supplies: this.supplyList(), grenades: this.grenadeList(), vitals: this.vitals(p),
    };
  }

  // Called for the host's own player and for every remote message.
  handle(from, m) {
    const p = this.players.get(from);
    if (m.type !== 'join' && !p) return;
    if (p) p.last = now();
    switch (m.type) {
      case 'join': {
        if (p) return;
        const res = this.addPlayer({ ...m.player, id: from }, m.rejoin);
        if (res.error) { this.game.net.kick(from, { type: 'reject', reason: res.error }); return; }
        if (from === this.game.me.id) this.game.apply(this.welcome(res.player));
        else this.game.net.sendTo(from, this.welcome(res.player));
        this.game.net.broadcast({ type: 'joined', player: this.meta(res.player) }, from);
        this.game.apply({ type: 'joined', player: this.meta(res.player) });
        if (m.rejoin?.primary && WEAPONS[m.rejoin.primary.type]) this.restorePrimary(res.player, m.rejoin.primary);
        break;
      }
      case 'st': {
        if (!p.alive) return;
        this.updateMovement(p, m);
        break;
      }
      case 'fire': {
        if (!p.alive || this.phase !== 'live') return;
        this.cancelUse(p);
        this.game.net.broadcast({ ...m, by: from }, from);
        if (from !== this.game.me.id) this.game.apply({ ...m, by: from });
        break;
      }
      case 'hit': this.onHit(p, m); break;
      case 'blast': this.onBlast(p, m); break;
      case 'pickup': this.onPickup(p, m); break;
      case 'drop': this.onDrop(p, m); break;
      case 'grab': this.onGrab(p, m); break;
      case 'throw': this.onThrow(p, m); break;
      case 'supplyPickup': this.onSupplyPickup(p, m); break;
      case 'useSupply': this.onUseSupply(p, m); break;
      case 'cancelUse': this.cancelUse(p); break;
      case 'throwGrenade': this.onThrowGrenade(p, m); break;
      case 'respawn': {
        if (p.alive || now() - p.diedAt < (RESPAWN_DELAY - 0.6) * 1000 || this.phase !== 'live') return;
        this.respawn(p);
        break;
      }
      case 'emote': {
        if (now() - (p.lastEmote || 0) < 1500) return;
        p.lastEmote = now();
        this.emit({ type: 'emote', id: from });
        break;
      }
      case 'leave': this.removePlayer(from); break;
    }
  }

  restorePrimary(p, prim) {
    const free = [...this.guns.values()].find(g => !g.heldBy && g.type === prim.type);
    if (!free) return;
    free.heldBy = p.id; p.gunId = free.id; p.primary = free.type;
    this.emit({ type: 'guns', list: this.gunList() });
    this.emit({ type: 'gunGrant', to: p.id, id: free.id, gun: free.type, ammo: prim.ammo | 0, res: prim.res | 0 });
  }

  respawn(p) {
    const s = this.pickSpawn(p.team);
    Object.assign(p, { x: s.x, y: 0, z: s.z, yaw: s.yaw, hp: MAX_HP, alive: true, w: 'glock', lastGrenade: -Infinity }, freshVitals());
    this.emit({ type: 'spawn', id: p.id, x: s.x, y: 0, z: s.z, yaw: s.yaw, vitals: this.vitals(p) });
  }

  // Allowlist only movement fields, including for the local hosting player.
  // Client snapshots must never grant health, armor, inventory or a new life.
  updateMovement(p, m) {
    const b = this.world.bounds;
    p.x = clamp(+m.x, b.minX, b.maxX, p.x); p.y = clamp(+m.y, 0, 4, p.y); p.z = clamp(+m.z, b.minZ, b.maxZ, p.z);
    p.yaw = clamp(+m.yaw, -1000, 1000, p.yaw); p.pitch = clamp(+m.pitch, -Math.PI / 2, Math.PI / 2, p.pitch);
    p.cr = m.cr ? 1 : 0; p.w = String(m.w || '').slice(0, 12);
    p.mv = clamp(+m.mv, 0, 30, 0); p.g = m.g ? 1 : 0; p.pa = m.pa | 0; p.pr = m.pr | 0;
    if (p.using && Math.hypot(p.x - p.using.x, p.y - p.using.y, p.z - p.using.z) > 0.6) this.cancelUse(p);
  }

  cancelUse(p) {
    if (!p.using) return;
    p.using = null;
    this.sendVitals(p);
  }

  onSupplyPickup(p, m) {
    const item = this.supplies.get(m.id);
    if (!p.alive || this.phase !== 'live' || !item) return;
    if (Math.hypot(p.x - item.x, p.z - item.z) > PICK_RANGE || Math.abs(p.y - item.y) > 2.2) return;
    if (!clearSegment([p.x, p.y + (p.cr ? 0.9 : 1.5), p.z], [item.x, item.y + 0.15, item.z], this.world.colliders)) return;
    const def = SUPPLIES[item.kind];
    if (def.category === 'armor' || def.category === 'helmet') {
      const key = def.category, current = p[key];
      if (current && (current.tier > def.tier || (current.tier === def.tier && current.hp >= def.durability))) return;
      p[key] = { tier: def.tier, hp: def.durability, max: def.durability };
    } else {
      if (p.bag[item.kind] >= def.cap) return;
      p.bag[item.kind] = Math.min(def.cap, p.bag[item.kind] + def.amount);
    }
    this.supplies.delete(item.id);
    this.supplyRespawns.set(item.id, { item, remaining: def.respawn });
    this.emit({ type: 'supplies', list: this.supplyList() });
    this.sendVitals(p);
  }

  onUseSupply(p, m) {
    const def = Object.hasOwn(SUPPLIES, m.item) ? SUPPLIES[m.item] : null;
    if (!p.alive || this.phase !== 'live' || p.using || !def?.duration || !p.bag[m.item]) return;
    if ((def.category === 'heal' && p.hp >= def.healCap) || (def.category === 'boost' && p.boost >= 100)) return;
    p.using = { item: m.item, remaining: def.duration, x: p.x, y: p.y, z: p.z };
    this.sendVitals(p);
  }

  simulateSurvival(dt) {
    if (this.phase !== 'live') return;
    let changed = false;
    for (const [id, entry] of this.supplyRespawns) {
      entry.remaining -= dt;
      if (entry.remaining > 0) continue;
      this.supplies.set(id, entry.item); this.supplyRespawns.delete(id); changed = true;
    }
    if (changed) this.emit({ type: 'supplies', list: this.supplyList() });
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const beforeCompletion = p.using ? Math.min(dt, p.using.remaining) : dt;
      this.regenerate(p, beforeCompletion);
      if (p.using) {
        p.using.remaining -= dt;
        if (p.using.remaining <= 0) {
          const item = p.using.item, def = SUPPLIES[item];
          p.using = null;
          if (p.bag[item] > 0) {
            p.bag[item]--;
            if (def.category === 'heal') p.hp = Math.max(p.hp, Math.min(def.healCap, p.hp + def.heal));
            if (def.category === 'boost') p.boost = Math.min(100, p.boost + def.boost);
          }
          this.regenerate(p, Math.max(0, dt - beforeCompletion));
          this.sendVitals(p);
        }
      }
    }
  }

  regenerate(p, dt) {
    if (p.boost <= 0 || dt <= 0) return;
    const active = Math.min(dt, p.boost), enhanced = Math.min(active, Math.max(0, p.boost - 60));
    p.boost = Math.max(0, p.boost - active);
    p.regen += active + enhanced * 0.5;
    const gain = Math.floor(p.regen);
    if (gain > 0) { p.regen -= gain; p.hp = Math.min(MAX_HP, p.hp + gain); }
  }

  onThrowGrenade(p, m) {
    const def = Object.hasOwn(GRENADE, m.kind) ? GRENADE[m.kind] : null;
    if (!p.alive || this.phase !== 'live' || !def || !p.bag[m.kind] || p.propId || now() - p.lastGrenade < 700) return;
    if (!Array.isArray(m.dir) || m.dir.length !== 3 || !m.dir.every(Number.isFinite)) return;
    const length = Math.hypot(...m.dir);
    if (length < 0.1 || length > 2) return;
    const d = m.dir.map(v => v / length), eye = [p.x, p.y + (p.cr ? 0.85 : 1.4), p.z];
    const pos = eye.map((v, i) => v + d[i] * 0.3);
    if (!clearSegment(eye, pos, this.world.colliders, 0.1)) return;
    this.cancelUse(p);
    p.bag[m.kind]--; p.lastGrenade = now();
    const g = { id: 'n' + this.nextGrenade++, kind: m.kind, by: p.id, team: p.team, owner: p,
      x: pos[0], y: pos[1], z: pos[2], vx: d[0] * def.speed, vy: d[1] * def.speed + 2, vz: d[2] * def.speed,
      remaining: def.fuse, smoking: false };
    this.grenades.set(g.id, g);
    this.sendVitals(p);
    this.emit({ type: 'grenades', list: this.grenadeList() });
  }

  simulateGrenades(dt) {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / steps;
    let changed = false;
    for (const g of this.grenades.values()) {
      g.remaining -= dt;
      if (!g.smoking) for (let i = 0; i < steps; i++) stepGrenade(g, h, this.world.colliders, this.world.bounds);
      if (g.remaining > 0) continue;
      if (g.smoking) { this.grenades.delete(g.id); changed = true; continue; }
      const def = GRENADE[g.kind];
      this.emit({ type: 'detonate', kind: g.kind, id: g.id, p: [r2(g.x), r2(g.y), r2(g.z)], radius: def.radius, duration: def.duration });
      if (g.kind === 'smoke') {
        g.smoking = true; g.remaining = def.duration; g.vx = g.vy = g.vz = 0;
      } else {
        this.grenades.delete(g.id);
        if (this.phase === 'live') for (const t of this.players.values()) {
          if (!t.alive || (t.team === g.team && t.id !== g.by)) continue;
          const dist = Math.hypot(t.x - g.x, t.y + 0.8 - g.y, t.z - g.z);
          if (dist > def.radius) continue;
          if (!clearSegment([g.x, g.y + 0.12, g.z], [t.x, t.y + 0.9, t.z], this.world.colliders)) continue;
          const amount = def.damage * (1 - dist / def.radius) * (t.id === g.by ? 0.6 : 1);
          this.damage(t, amount, this.players.get(g.by) || g.owner, 'frag', false);
        }
      }
      changed = true;
    }
    if (changed) this.emit({ type: 'grenades', list: this.grenadeList() });
  }

  onHit(s, m) {
    const t = this.players.get(m.t);
    if (!t || !s.alive || !t.alive || t.team === s.team || this.phase !== 'live') return;
    let dmg = Number(m.dmg) || 0, weapon = m.w;
    if (m.pid) {
      const prop = this.props.get(m.pid);
      if (!prop || prop.thrownBy !== s.id || now() - prop.thrownAt > 5000 || prop.hitDone) return;
      prop.hitDone = true;
      prop.vx *= -0.2; prop.vz *= -0.2;
      dmg = Math.min(dmg, PROPS[prop.type].dmg * 1.3);
      weapon = 'prop:' + prop.type;
    } else {
      const w = WEAPONS[weapon];
      if (!w) return;
      if (w.slot === 1 && s.primary !== weapon) return;
      const backstab = w.melee && m.back && Math.cos(t.yaw - s.yaw) > 0.5;
      const max = backstab ? MAX_HP * 1.2 : w.dmg * (m.head ? w.headMult : 1) * (w.pellets || 1);
      dmg = Math.min(dmg, max);
      const dist = Math.hypot(t.x - s.x, t.z - s.z);
      if (dist > (w.range || 3) + 3) return;
    }
    if (dmg <= 0) return;
    this.cancelUse(s);
    this.damage(t, dmg, s, weapon, !!m.head);
  }

  onBlast(s, m) {
    if (this.phase !== 'live') return;
    if (!s.alive && now() - s.diedAt > 3000) return;
    if (s.primary !== 'rpg' || now() - s.lastShot < 900) return;
    s.lastShot = now();
    const [x, y, z] = (m.p || []).map(Number);
    if (![x, y, z].every(Number.isFinite)) return;
    this.emit({ type: 'blast', by: s.id, p: [x, y, z] });
    const w = WEAPONS.rpg;
    for (const t of this.players.values()) {
      if (!t.alive || (t.team === s.team && t.id !== s.id)) continue;
      const d = Math.hypot(t.x - x, t.y + 0.9 - y, t.z - z);
      if (d > w.blast) continue;
      if (!clearSegment([x, y, z], [t.x, t.y + 0.9, t.z], this.world.colliders)) continue;
      const dmg = w.dmg * (1 - d / w.blast * 0.75) * (t.id === s.id ? 0.35 : 1);
      this.damage(t, dmg, s, 'rpg', false);
    }
  }

  damage(t, amount, s, weapon, head) {
    if (!t.alive || this.phase !== 'live' || !Number.isFinite(amount) || amount <= 0) return;
    t.using = null;
    const key = head ? 'helmet' : 'armor', gear = t[key];
    if (gear && gear.hp > 0 && weapon !== 'knife') {
      const def = head ? SUPPLIES.helmet : SUPPLIES['vest' + gear.tier];
      const absorbed = Math.min(gear.hp, amount * def.reduction);
      amount -= absorbed;
      gear.hp = r2(Math.max(0, gear.hp - absorbed));
      if (gear.hp <= 0) t[key] = null;
    }
    t.hp = Math.max(0, Math.round(t.hp - amount));
    this.emit({ type: 'dmg', t: t.id, hp: t.hp, by: s.id, head, w: weapon, from: [r2(s.x), r2(s.z)] });
    if (t.hp > 0) { this.sendVitals(t); return; }
    t.alive = false;
    t.boost = 0; t.regen = 0;
    this.sendVitals(t);
    t.diedAt = now();
    t.deaths++;
    if (t.id !== s.id) { s.kills++; this.score[s.team]++; }
    this.dropPrimary(t, t.pa, t.pr);
    this.releaseProp(t);
    this.emit({
      type: 'kill', v: t.id, k: s.id, w: weapon, head, score: this.score,
      kd: { [t.id]: [t.kills, t.deaths], [s.id]: [s.kills, s.deaths] },
    });
    if (this.score[s.team] >= SCORE_TO_WIN && this.phase === 'live') {
      this.phase = 'end';
      this.phaseAt = now();
      this.emit({ type: 'match', phase: 'end', winner: s.team, score: this.score });
    }
  }

  dropPrimary(p, ammo, res) {
    if (!p.gunId) return;
    const g = this.guns.get(p.gunId);
    if (g) {
      g.heldBy = null;
      g.x = p.x + Math.sin(p.yaw) * -0.6; g.z = p.z + Math.cos(p.yaw) * -0.6; g.y = p.y + 0.06;
      g.ammo = Math.max(0, ammo | 0); g.res = Math.max(0, res | 0);
    }
    p.gunId = null; p.primary = null;
    this.emit({ type: 'guns', list: this.gunList() });
  }

  releaseProp(p) {
    if (!p.propId) return;
    const prop = this.props.get(p.propId);
    p.propId = null;
    if (!prop) return;
    this.launch(prop, p.id, [p.x, p.y + 1.1, p.z], [0, 0, 0], 0, false);
  }

  launch(prop, by, pos, vel, spin, harmful) {
    Object.assign(prop, {
      state: 'fly', heldBy: null, thrownBy: harmful ? by : null, thrownAt: now(), hitDone: !harmful,
      x: pos[0], y: pos[1], z: pos[2], vx: vel[0], vy: vel[1], vz: vel[2], spin,
    });
    this.emit({ type: 'thrown', id: prop.id, by, p: pos.map(r2), v: vel.map(r2), spin: r2(spin), harmful });
  }

  onPickup(p, m) {
    const g = this.guns.get(m.id);
    if (!p.alive || this.phase !== 'live' || !g || g.heldBy) return;
    if (Math.hypot(p.x - g.x, p.z - g.z) > PICK_RANGE || Math.abs(p.y - g.y) > 2.2) return;
    if (!clearSegment([p.x, p.y + (p.cr ? 0.9 : 1.5), p.z], [g.x, g.y + 0.1, g.z], this.world.colliders)) return;
    if (p.gunId) this.dropPrimary(p, m.ammo, m.res);
    g.heldBy = p.id; p.gunId = g.id; p.primary = g.type;
    this.emit({ type: 'guns', list: this.gunList() });
    this.emit({ type: 'gunGrant', to: p.id, id: g.id, gun: g.type, ammo: g.ammo, res: g.res });
  }

  onDrop(p, m) {
    if (!p.alive || !p.gunId) return;
    this.dropPrimary(p, m.ammo, m.res);
  }

  onGrab(p, m) {
    const prop = this.props.get(m.id);
    if (!p.alive || !prop || prop.state === 'held' || p.propId) return;
    if (Math.hypot(p.x - prop.x, p.z - prop.z) > PICK_RANGE || Math.abs(p.y + 1 - prop.y) > 2.4) return;
    prop.state = 'held'; prop.heldBy = p.id; p.propId = prop.id;
    this.emit({ type: 'propHeld', id: prop.id, by: p.id });
  }

  onThrow(p, m) {
    const prop = this.props.get(m.id);
    if (!p.alive || this.phase !== 'live' || !prop || prop.heldBy !== p.id) return;
    const pos = (m.p || []).map(Number), vel = (m.v || []).map(Number);
    if (pos.length !== 3 || vel.length !== 3 || ![...pos, ...vel].every(Number.isFinite)) return;
    const speed = Math.hypot(...vel);
    if (speed > 30) vel.forEach((v, i) => { vel[i] = v / speed * 30; });
    if (Math.hypot(pos[0] - p.x, pos[2] - p.z) > 2) { pos[0] = p.x; pos[1] = p.y + 1.4; pos[2] = p.z; }
    p.propId = null;
    this.cancelUse(p);
    this.launch(prop, p.id, pos, vel, Number(m.spin) || 0, speed > 4);
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.dropPrimary(p, p.pa, p.pr);
    this.releaseProp(p);
    this.players.delete(id);
    this.game.net.kick(id);
    this.emit({ type: 'left', id });
  }

  simulateProps(dt) {
    const steps = Math.ceil(dt / (1 / 120));
    const h = dt / steps;
    for (const p of this.props.values()) {
      if (p.state !== 'fly') continue;
      let rested = false;
      for (let i = 0; i < steps && !rested; i++) rested = stepProp(p, h, this.world.colliders, this.world.bounds);
      if (rested || now() - p.thrownAt > 8000) {
        p.state = 'rest';
        p.vx = p.vy = p.vz = 0;
        this.emit({ type: 'propRest', id: p.id, x: r2(p.x), y: r2(p.y), z: r2(p.z), ry: r2(p.ry) });
      }
    }
  }

  tick(dt) {
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(0.25, dt)) : 0;
    const me = this.game.me, self = this.players.get(me.id);
    if (self) {
      if (self.alive) this.updateMovement(self, this.game.localState());
      self.last = now();
    }
    this.simulateProps(dt);
    this.simulateSurvival(dt);
    this.simulateGrenades(dt);
    const s = [];
    for (const p of this.players.values()) {
      s.push([p.id, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), (p.cr ? 1 : 0) | (p.alive ? 2 : 0) | (p.g ? 4 : 0), p.w, r2(p.mv), p.hp]);
    }
    this.emit({ type: 'snap', s, v: [...this.players.values()].map(p => ({ id: p.id, ...this.vitals(p) })), grenades: this.grenadeList() });
    for (const p of [...this.players.values()]) if (p.id !== me.id && now() - p.last > 10000) this.removePlayer(p.id);
    if (this.phase === 'end' && now() - this.phaseAt > 8000) this.restartMatch();
  }

  restartMatch() {
    this.phase = 'live';
    this.score = { 1: 0, 2: 0 };
    this.seed();
    for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; p.gunId = null; p.primary = null; p.propId = null; }
    this.emit({ type: 'match', phase: 'live', score: this.score, guns: this.gunList(), props: this.propList(), supplies: this.supplyList(), grenades: this.grenadeList() });
    for (const p of this.players.values()) this.respawn(p);
  }
}

function clamp(v, lo, hi, fallback) {
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}
