import * as THREE from 'three';
import { TEAMS, WEAPONS, PROPS, SCORE_TO_WIN, charById } from './config.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const weaponLabel = w => (w?.startsWith('prop:') ? PROPS[w.slice(5)]?.name : WEAPONS[w]?.name) || w || '?';

export class Hud {
  constructor(world) {
    this.world = world;
    this.radarCanvas = $('radar');
    this.radarCtx = this.radarCanvas.getContext('2d');
    this.buildRadarImage();
    this.tags = new Map();
    this.bubbles = new Map();
    this.v = new THREE.Vector3();
    $('hud').classList.remove('hide');
  }

  buildRadarImage() {
    const b = this.world.bounds, s = 6;
    const c = document.createElement('canvas');
    c.width = (b.maxX - b.minX) * s; c.height = (b.maxZ - b.minZ) * s;
    const x = c.getContext('2d');
    x.fillStyle = 'rgba(40,48,58,.9)'; x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(255,122,26,.18)'; x.fillRect(0, 0, 12 * s, c.height);
    x.fillStyle = 'rgba(47,140,255,.18)'; x.fillRect(c.width - 12 * s, 0, 12 * s, c.height);
    for (const r of this.world.radar) {
      x.fillStyle = r.glass ? 'rgba(140,200,255,.55)' : r.tall ? 'rgba(210,218,228,.95)' : 'rgba(120,132,146,.9)';
      x.fillRect((r.x - r.hx - b.minX) * s, (r.z - r.hz - b.minZ) * s, r.hx * 2 * s, r.hz * 2 * s);
    }
    this.radarImg = c;
  }

  radar(me, players, now) {
    const ctx = this.radarCtx, W = this.radarCanvas.width, b = this.world.bounds;
    const scale = 3.2;
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = 'rgba(10,14,20,.8)'; ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    ctx.rotate(me.yaw);
    ctx.scale(scale, scale);
    ctx.translate(-me.pos.x, -me.pos.z);
    ctx.drawImage(this.radarImg, b.minX, b.minZ, b.maxX - b.minX, b.maxZ - b.minZ);
    for (const p of players.values()) {
      if (!p.alive) continue;
      const mate = p.team === me.team;
      if (!mate && now - (p.lastFired || 0) > 1800) continue;
      ctx.fillStyle = mate ? TEAMS[p.team].color : '#ef4444';
      ctx.beginPath(); ctx.arc(p.rx, p.rz, mate ? 1.1 : 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 0.3; ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.stroke();
  }

  setHp(hp) {
    $('hpVal').textContent = Math.max(0, Math.round(hp));
    $('hpBar').style.width = Math.max(0, Math.min(100, hp)) + '%';
    $('hpBox').classList.toggle('low', hp <= 25);
  }

  setWeapon(name, ammo, res, melee) {
    $('weaponName').textContent = name;
    $('ammoVal').textContent = melee ? '' : ammo;
    $('resVal').textContent = melee ? '' : '/ ' + res;
    $('ammoVal').classList.toggle('low', !melee && ammo <= 5);
  }

  setSlots(list) {
    $('slots').innerHTML = list.map(s => `<div class="slot${s.active ? ' on' : ''}"><kbd>${s.key}</kbd><span>${esc(s.name)}</span></div>`).join('');
  }

  reload(progress) {
    const el = $('reloadBar');
    el.classList.toggle('show', progress !== null);
    if (progress !== null) el.firstElementChild.style.width = Math.round(progress * 100) + '%';
  }

  crosshair(gap, hidden = false) {
    const c = $('crosshair');
    c.style.setProperty('--gap', gap.toFixed(1) + 'px');
    c.classList.toggle('hide', hidden);
  }

  hitmarker(head, kill = false) {
    const h = $('hitmarker');
    h.className = '';
    void h.offsetWidth;
    h.className = 'on' + (head ? ' head' : '') + (kill ? ' kill' : '');
  }

  damageFrom(angle) {
    const d = document.createElement('div');
    d.className = 'dmgdir';
    d.style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
    $('dmgDirs').appendChild(d);
    setTimeout(() => d.remove(), 1200);
    const v = $('vignette');
    v.classList.remove('on'); void v.offsetWidth; v.classList.add('on');
  }

  killfeed(killer, victim, weapon, head, mine) {
    const row = document.createElement('div');
    row.className = 'kf' + (mine ? ' mine' : '');
    const k = killer ? `<b style="color:${TEAMS[killer.team]?.color}">${esc(killer.name)}</b>` : '';
    row.innerHTML = `${k}<span class="kw">${esc(weaponLabel(weapon))}${head ? ' <i class="hs">&#9673;</i>' : ''}</span><b style="color:${TEAMS[victim.team]?.color}">${esc(victim.name)}</b>`;
    $('killfeed').prepend(row);
    while ($('killfeed').children.length > 6) $('killfeed').lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 6000);
    setTimeout(() => row.remove(), 6600);
  }

  score(score, alive) {
    $('scoreAuto').textContent = score[1];
    $('scoreDjb').textContent = score[2];
    $('aliveAuto').textContent = alive[1] + ' alive';
    $('aliveDjb').textContent = alive[2] + ' alive';
    $('scoreGoal').textContent = 'FIRST TO ' + SCORE_TO_WIN;
  }

  prompt(text) {
    const p = $('prompt');
    p.innerHTML = text || '';
    p.classList.toggle('show', !!text);
  }

  enemyName(name) {
    const e = $('enemyName');
    e.textContent = name || '';
    e.classList.toggle('show', !!name);
  }

  charge(v) {
    const c = $('charge');
    c.classList.toggle('show', v > 0);
    c.firstElementChild.style.width = Math.round(v * 100) + '%';
  }

  scope(on) {
    $('scope').classList.toggle('show', on);
  }

  death(info) {
    const d = $('deathPanel');
    d.classList.toggle('hide', !info);
    if (!info) return;
    $('killerName').textContent = info.killer;
    $('killerName').style.color = info.color;
    $('killerWeapon').textContent = info.weapon + (info.head ? ' - headshot' : '');
  }

  respawnIn(sec) {
    $('respawnIn').textContent = sec > 0 ? `Redeploying in ${sec.toFixed(1)}s` : 'Redeploying...';
  }

  banner(html, ms = 2500) {
    const b = $('banner');
    b.innerHTML = html;
    b.classList.remove('hide');
    clearTimeout(this.bannerT);
    if (ms) this.bannerT = setTimeout(() => b.classList.add('hide'), ms);
  }

  toast(text, ms = 3000) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  netBadge(text) { $('netBadge').textContent = text; }

  scoreboard(show, me, players, score) {
    const sb = $('scoreboard');
    sb.classList.toggle('hide', !show);
    if (!show) return;
    const all = [{ ...me, you: true }, ...players.values()];
    const col = t => {
      const rows = all.filter(p => p.team === t).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      return `<div class="sbcol" style="--tc:${TEAMS[t].color}"><h3><span>${TEAMS[t].name}</span><b>${score[t]}</b></h3>
        <div class="sbrow head"><span>Player</span><span>Character</span><span>K</span><span>D</span></div>
        ${rows.map(p => `<div class="sbrow${p.you ? ' you' : ''}${p.alive ? '' : ' dead'}"><span>${esc(p.name)}</span><span>${esc(charById(p.char).name)}</span><span>${p.kills}</span><span>${p.deaths}</span></div>`).join('') || '<div class="sbrow empty">Nobody here yet</div>'}</div>`;
    };
    sb.innerHTML = `<div class="sbtitle">MECHANICAL WAR <small>First to ${SCORE_TO_WIN}</small></div><div class="sbgrid">${col(1)}${col(2)}</div>`;
  }

  // Floating labels: teammate names and speech bubbles.
  labels(camera, me, players, now) {
    const W = innerWidth, H = innerHeight;
    for (const [id, el] of this.tags) if (!players.has(id)) { el.remove(); this.tags.delete(id); }
    for (const p of players.values()) {
      let el = this.tags.get(p.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'tag';
        $('tags').appendChild(el);
        this.tags.set(p.id, el);
      }
      const bubble = this.bubbles.get(p.id);
      const showTag = p.team === me.team && p.alive;
      const showBubble = bubble && now < bubble.until && p.alive;
      if (!showTag && !showBubble) { el.style.display = 'none'; continue; }
      this.v.set(p.rx, p.ry + (p.crouch ? 1.55 : 2.05), p.rz).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) { el.style.display = 'none'; continue; }
      el.style.display = 'block';
      el.style.left = ((this.v.x * 0.5 + 0.5) * W) + 'px';
      el.style.top = ((-this.v.y * 0.5 + 0.5) * H) + 'px';
      const html = (showBubble ? `<div class="bubble">${esc(bubble.text)}</div>` : '') +
        (showTag ? `<span style="color:${TEAMS[p.team].color}">${esc(p.name)}</span><i><u style="width:${p.hp}%"></u></i>` : '');
      if (el._html !== html) { el.innerHTML = html; el._html = html; }
    }
  }

  bubble(id, text) {
    this.bubbles.set(id, { text, until: performance.now() + 3200 });
  }

  selfBubble(text) {
    const b = $('selfBubble');
    b.textContent = text;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
}
