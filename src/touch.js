// Touch controls for phones and tablets: floating move stick, drag-to-look, action buttons.
export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

const BUTTONS = [
  ['fire', 'FIRE'], ['jump', 'JUMP'], ['crouch', 'DUCK'], ['reload', 'R'],
  ['use', 'USE'], ['swap', 'SWAP'], ['scope', 'SCOPE'], ['pause', 'II'],
];

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.move = { x: 0, z: 0 };
    const root = document.createElement('div');
    root.id = 'touch';
    root.innerHTML = `<div class="t-stick-zone"><div class="t-stick"><i></i></div></div><div class="t-look"></div>`
      + BUTTONS.map(([id, label]) => `<button class="t-btn t-${id}" data-act="${id}">${label}</button>`).join('');
    document.body.appendChild(root);
    this.root = root;
    this.bindStick(root.querySelector('.t-stick-zone'), root.querySelector('.t-stick'));
    this.bindLook(root.querySelector('.t-look'));
    for (const b of root.querySelectorAll('.t-btn')) this.bindButton(b);
  }

  bindStick(zone, stick) {
    const knob = stick.querySelector('i');
    let id = null, ox = 0, oy = 0;
    zone.addEventListener('pointerdown', e => {
      id = e.pointerId; ox = e.clientX; oy = e.clientY;
      zone.setPointerCapture(id);
      stick.style.left = ox + 'px'; stick.style.top = oy + 'px';
      stick.classList.add('on');
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - ox, dy = e.clientY - oy, len = Math.hypot(dx, dy), max = 56;
      const k = len > max ? max / len : 1;
      this.move.x = (dx * k) / max;
      this.move.z = (dy * k) / max;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; this.move.x = this.move.z = 0;
      knob.style.transform = '';
      stick.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  bindLook(zone) {
    let id = null, lx = 0, ly = 0;
    zone.addEventListener('pointerdown', e => { id = e.pointerId; lx = e.clientX; ly = e.clientY; zone.setPointerCapture(id); });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const g = this.game, dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (!g.me.alive) return;
      const k = 0.0055 * g.settings.sensitivity * (g.wep.scoped ? 0.32 : 1);
      g.me.yaw -= dx * k;
      g.me.pitch = Math.max(-1.52, Math.min(1.52, g.me.pitch - dy * k));
      g.mouse.dx += dx; g.mouse.dy += dy;
    });
    const end = e => { if (e.pointerId === id) id = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  bindButton(btn) {
    const g = this.game, act = btn.dataset.act;
    const down = e => {
      e.preventDefault();
      btn.classList.add('on');
      g.touchAction(act, true);
    };
    const up = e => {
      e.preventDefault();
      btn.classList.remove('on');
      g.touchAction(act, false);
    };
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }

  dispose() { this.root.remove(); }
}
