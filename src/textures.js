import * as THREE from 'three';

const cache = new Map();
let anisotropy = 8;
export const setAnisotropy = v => {
  anisotropy = v;
  // Materials are cached across matches; a quality change also updates existing maps.
  for (const texture of cache.values()) {
    if (texture.anisotropy !== v) { texture.anisotropy = v; texture.needsUpdate = true; }
  }
};

function rand(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(canvas, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

function noise(ctx, w, h, amount, seed = 1, mono = true) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data, r = rand(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    const m = mono ? n : 0;
    d[i] += mono ? m : (r() - 0.5) * amount;
    d[i + 1] += mono ? m : (r() - 0.5) * amount;
    d[i + 2] += mono ? m : (r() - 0.5) * amount;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, w, h, count, color, maxR, seed) {
  const r = rand(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * w, y = r() * h, rad = maxR * (0.3 + r());
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

// Each texture reports `meters`: the world size covered by one repeat, used by world-space UVs.
export const TEX = {
  carpet: () => cached('carpet', () => {
    const [c, x] = makeCanvas(512, 512);
    x.fillStyle = '#666762'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      x.fillStyle = (i + j) % 2 ? '#686a66' : '#62645f';
      x.fillRect(i * 128, j * 128, 128, 128);
      x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 1.5;
      for (let k = 0; k < 128; k += 5) {
        x.beginPath();
        if ((i + j) % 2) { x.moveTo(i * 128 + k, j * 128); x.lineTo(i * 128 + k, j * 128 + 128); }
        else { x.moveTo(i * 128, j * 128 + k); x.lineTo(i * 128 + 128, j * 128 + k); }
        x.stroke();
      }
    }
    noise(x, 512, 512, 31, 7);
    blotches(x, 512, 512, 18, 'rgba(20,20,30,.10)', 60, 3);
    x.strokeStyle = 'rgba(0,0,0,.19)'; x.lineWidth = 1;
    for (let p = 0; p <= 512; p += 128) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 512); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(512, p); x.stroke(); }
    const t = toTexture(c); t.userData.meters = 2; return t;
  }),

  ceiling: () => cached('ceiling', () => {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#d2d0ca'; x.fillRect(0, 0, 256, 256);
    const r = rand(11);
    for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(90,90,80,${0.08 + r() * 0.2})`; x.fillRect(r() * 256, r() * 256, 1.5, 1.5); }
    x.fillStyle = '#b9b7b0';
    for (let p = 0; p <= 256; p += 128) { x.fillRect(p - 3, 0, 6, 256); x.fillRect(0, p - 3, 256, 6); }
    const t = toTexture(c); t.userData.meters = 1.2; return t;
  }),

  drywall: () => cached('drywall', () => {
    const [c, x] = makeCanvas(512, 512);
    x.fillStyle = '#cbc8bb'; x.fillRect(0, 0, 512, 512);
    blotches(x, 512, 512, 45, 'rgba(110,100,80,.055)', 90, 5);
    noise(x, 512, 512, 11, 9);
    const r = rand(10);
    x.strokeStyle = 'rgba(80,75,63,.07)'; x.lineWidth = 0.8;
    for (let i = 0; i < 70; i++) {
      const px = r() * 512, py = r() * 512;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + r() * 12, py + r() * 2); x.stroke();
    }
    const t = toTexture(c); t.userData.meters = 2.5; return t;
  }),

  paintBlue: () => cached('paintBlue', () => {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#2b4058'; x.fillRect(0, 0, 256, 256);
    noise(x, 256, 256, 10, 4);
    const t = toTexture(c); t.userData.meters = 2; return t;
  }),

  wood: () => cached('wood', () => {
    const [c, x] = makeCanvas(512, 512);
    x.fillStyle = '#a8784c'; x.fillRect(0, 0, 512, 512);
    const r = rand(21);
    for (let i = 0; i < 180; i++) {
      const y = r() * 512, amp = 2 + r() * 6, freq = 0.005 + r() * 0.02, ph = r() * 6;
      x.strokeStyle = `rgba(${60 + r() * 40},${35 + r() * 20},${15},${0.08 + r() * 0.18})`;
      x.lineWidth = 0.6 + r() * 2.2;
      x.beginPath();
      for (let px = 0; px <= 512; px += 8) x.lineTo(px, y + Math.sin(px * freq + ph) * amp);
      x.stroke();
    }
    noise(x, 512, 512, 14, 22);
    const t = toTexture(c); t.userData.meters = 1.6; return t;
  }),

  darkWood: () => cached('darkWood', () => {
    const [c, x] = makeCanvas(512, 512);
    x.drawImage(TEX.wood().image, 0, 0);
    x.fillStyle = 'rgba(40,18,8,.62)'; x.fillRect(0, 0, 512, 512);
    const t = toTexture(c); t.userData.meters = 1.6; return t;
  }),

  concrete: () => cached('concrete', () => {
    const [c, x] = makeCanvas(512, 512);
    x.fillStyle = '#8b8d8f'; x.fillRect(0, 0, 512, 512);
    blotches(x, 512, 512, 60, 'rgba(60,60,60,.12)', 70, 31);
    blotches(x, 512, 512, 40, 'rgba(200,200,200,.08)', 50, 32);
    noise(x, 512, 512, 34, 33);
    x.strokeStyle = 'rgba(40,40,40,.4)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, 256); x.lineTo(512, 256); x.moveTo(256, 0); x.lineTo(256, 512); x.stroke();
    const t = toTexture(c); t.userData.meters = 4; return t;
  }),

  tiles: () => cached('tiles', () => {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#9ca3a8'; x.fillRect(0, 0, 256, 256);
    const r = rand(41);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const v = 222 + r() * 16 | 0;
      x.fillStyle = (i + j) % 2 ? `rgb(${v},${v},${v - 4})` : `rgb(${v - 150},${v - 146},${v - 140})`;
      x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    }
    noise(x, 256, 256, 10, 42);
    const t = toTexture(c); t.userData.meters = 1.2; return t;
  }),

  fabric: () => cached('fabric', () => {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#5b6573'; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(0,0,0,.16)';
    for (let p = 0; p < 256; p += 3) { x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 256); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(256, p); x.stroke(); }
    noise(x, 256, 256, 26, 51);
    const t = toTexture(c); t.userData.meters = 0.8; return t;
  }),

  metal: () => cached('metal', () => {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#808890'; x.fillRect(0, 0, 256, 256);
    const r = rand(61);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${r() * 0.06})`; x.fillRect(0, r() * 256, 256, 1); }
    noise(x, 256, 256, 18, 62);
    const t = toTexture(c); t.userData.meters = 1; return t;
  }),

  // Small, reusable surface details keep the office self-contained and inexpensive.
  lightLens: () => cached('lightLens', () => {
    const [c, x] = makeCanvas(256, 128);
    x.fillStyle = '#d8dbcb'; x.fillRect(0, 0, 256, 128);
    for (let y = 0; y < 128; y += 8) for (let px = 0; px < 256; px += 8) {
      x.fillStyle = '#fbf8df'; x.fillRect(px + 1, y + 1, 5, 5);
      x.fillStyle = '#bfc4b7'; x.fillRect(px + 6, y, 1, 8);
    }
    return toTexture(c, { repeat: false });
  }),

  vent: () => cached('vent', () => {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#a7aba5'; x.fillRect(0, 0, 256, 256);
    for (let n = 0; n < 5; n++) {
      const p = 18 + n * 18;
      x.strokeStyle = '#555d59'; x.lineWidth = 6; x.strokeRect(p, p, 256 - p * 2, 256 - p * 2);
      x.strokeStyle = '#dadbd1'; x.lineWidth = 3; x.strokeRect(p + 4, p + 4, 248 - p * 2, 248 - p * 2);
    }
    noise(x, 256, 256, 8, 92);
    return toTexture(c, { repeat: false });
  }),

  sign: (label, number) => cached('sign:' + label, () => {
    const [c, x] = makeCanvas(512, 128);
    x.fillStyle = '#253339'; x.fillRect(0, 0, 512, 128);
    x.fillStyle = '#bdaf85'; x.fillRect(0, 0, 9, 128);
    x.fillStyle = '#9aa69e'; x.font = '16px Arial'; x.fillText('MECHANICAL WORKS  /  LEVEL 04', 28, 28);
    x.fillStyle = '#eeeee2'; x.font = 'bold 34px Arial'; x.fillText(label, 27, 77);
    x.fillStyle = '#bdaf85'; x.font = '18px Arial'; x.fillText(number, 29, 106);
    return toTexture(c, { repeat: false });
  }),

  contactShadow: () => cached('contactShadow', () => {
    const [c, x] = makeCanvas(128, 128);
    const img = x.createImageData(128, 128);
    for (let py = 0; py < 128; py++) for (let px = 0; px < 128; px++) {
      const edge = Math.max(Math.abs(px - 63.5), Math.abs(py - 63.5)) / 64;
      const a = 1 - THREE.MathUtils.smoothstep(edge, 0.45, 1);
      const i = (py * 128 + px) * 4;
      img.data[i + 3] = a * 128;
    }
    x.putImageData(img, 0, 0);
    return toTexture(c, { repeat: false });
  }),

  windowLight: () => cached('windowLight', () => {
    const [c, x] = makeCanvas(256, 256);
    const img = x.createImageData(256, 256);
    for (let py = 0; py < 256; py++) for (let px = 0; px < 256; px++) {
      const u = px / 255, v = py / 255;
      const edge = Math.min(u, 1 - u) * 24;
      const fade = Math.sin(v * Math.PI) ** 0.65;
      const mullion = Math.abs(u - 0.5) < 0.014 ? 0.12 : 1;
      const i = (py * 256 + px) * 4;
      img.data[i] = 235; img.data[i + 1] = 211; img.data[i + 2] = 159;
      img.data[i + 3] = Math.min(1, edge) * fade * mullion * 72;
    }
    x.putImageData(img, 0, 0);
    return toTexture(c, { repeat: false });
  }),

  city: () => cached('city', () => {
    const [c, x] = makeCanvas(2048, 512);
    const sky = x.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#6f9fcf'); sky.addColorStop(0.55, '#b9d3e6'); sky.addColorStop(1, '#e9d9bf');
    x.fillStyle = sky; x.fillRect(0, 0, 2048, 512);
    const r = rand(71);
    for (let layer = 0; layer < 3; layer++) {
      const base = 512, shade = [150, 110, 70][layer];
      let px = -20;
      while (px < 2048) {
        const w = 40 + r() * 120, h = (120 + r() * 260) * (0.55 + layer * 0.3);
        x.fillStyle = `rgb(${shade - 20},${shade - 8},${shade + 10})`;
        x.fillRect(px, base - h, w, h);
        if (layer === 2) {
          for (let wy = base - h + 8; wy < base - 10; wy += 12) for (let wx = px + 5; wx < px + w - 6; wx += 10) {
            x.fillStyle = r() > 0.72 ? 'rgba(255,236,190,.55)' : 'rgba(30,50,70,.55)';
            x.fillRect(wx, wy, 6, 7);
          }
        }
        px += w + r() * 14;
      }
    }
    const t = toTexture(c, { repeat: false }); return t;
  }),

  screen: variant => cached('screen' + variant, () => {
    const [c, x] = makeCanvas(256, 160);
    const r = rand(100 + variant);
    const bg = ['#0f172a', '#ffffff', '#0b1020', '#10281b', '#1e1b2e', '#f8fafc'][variant % 6];
    x.fillStyle = bg; x.fillRect(0, 0, 256, 160);
    if (variant % 6 === 0) {
      x.fillStyle = '#1e293b'; x.fillRect(0, 0, 40, 160);
      for (let y = 12; y < 156; y += 9) {
        let px = 48 + (r() * 3 | 0) * 10;
        const n = 2 + r() * 4 | 0;
        for (let k = 0; k < n; k++) {
          const w = 10 + r() * 38;
          x.fillStyle = ['#7dd3fc', '#f0abfc', '#86efac', '#fde68a', '#cbd5e1'][r() * 5 | 0];
          x.fillRect(px, y, w, 4); px += w + 5;
        }
      }
    } else if (variant % 6 === 1) {
      x.fillStyle = '#217346'; x.fillRect(0, 0, 256, 14);
      x.strokeStyle = '#d4d4d4';
      for (let px = 0; px < 256; px += 32) { x.beginPath(); x.moveTo(px, 14); x.lineTo(px, 160); x.stroke(); }
      for (let y = 14; y < 160; y += 9) { x.beginPath(); x.moveTo(0, y); x.lineTo(256, y); x.stroke(); }
      x.fillStyle = '#374151';
      for (let y = 18; y < 156; y += 9) for (let px = 4; px < 250; px += 32) if (r() > 0.25) x.fillRect(px, y, 8 + r() * 18, 3);
    } else if (variant % 6 === 2) {
      x.fillStyle = '#38bdf8';
      for (let i = 0; i < 12; i++) { const h = 20 + r() * 90; x.fillRect(20 + i * 18, 140 - h, 12, h); }
      x.strokeStyle = '#f59e0b'; x.lineWidth = 3; x.beginPath();
      for (let i = 0; i < 12; i++) x.lineTo(26 + i * 18, 60 + Math.sin(i) * 20 + r() * 20);
      x.stroke();
    } else if (variant % 6 === 3) {
      x.fillStyle = '#22c55e'; x.font = 'bold 13px monospace';
      for (let y = 16; y < 160; y += 14) x.fillText('> ' + Math.floor(r() * 1e8).toString(16) + ' OK', 8, y);
    } else if (variant % 6 === 4) {
      x.fillStyle = '#ff7a1a'; x.font = 'bold 44px Arial'; x.textAlign = 'center'; x.fillText('AUTO', 128, 92);
      x.fillStyle = '#94a3b8'; x.font = '12px Arial'; x.fillText('Q4 production targets', 128, 118);
    } else {
      x.fillStyle = '#e2e8f0'; x.fillRect(0, 0, 70, 160);
      x.fillStyle = '#2f8cff'; x.font = 'bold 40px Arial'; x.textAlign = 'center'; x.fillText('DJB', 164, 70);
      x.fillStyle = '#475569';
      for (let y = 90; y < 150; y += 10) x.fillRect(84, y, 60 + r() * 100, 4);
      for (let y = 10; y < 150; y += 14) x.fillRect(8, y, 40 + r() * 20, 5);
    }
    const t = toTexture(c, { repeat: false }); return t;
  }),

  rack: () => cached('rack', () => {
    const [c, x] = makeCanvas(128, 512);
    x.fillStyle = '#0b0d10'; x.fillRect(0, 0, 128, 512);
    const r = rand(81);
    for (let y = 8; y < 504; y += 28) {
      x.fillStyle = '#1b1f26'; x.fillRect(6, y, 116, 24);
      x.fillStyle = '#0a0b0d';
      for (let vx = 12; vx < 80; vx += 5) x.fillRect(vx, y + 5, 3, 14);
      for (let k = 0; k < 4; k++) {
        x.fillStyle = r() > 0.3 ? ['#22c55e', '#22c55e', '#38bdf8', '#f59e0b'][r() * 4 | 0] : '#1f2937';
        x.fillRect(90 + k * 7, y + 9, 4, 4);
      }
    }
    return toTexture(c, { repeat: false });
  }),

  whiteboard: () => cached('whiteboard', () => {
    const [c, x] = makeCanvas(512, 256);
    x.fillStyle = '#f8fafc'; x.fillRect(0, 0, 512, 256);
    x.lineWidth = 4; x.lineCap = 'round';
    x.strokeStyle = '#1d4ed8'; x.font = 'bold 34px "Comic Sans MS", cursive'; x.fillStyle = '#1d4ed8';
    x.fillText('Q4 STRATEGY', 30, 50);
    x.strokeStyle = '#dc2626'; x.beginPath(); x.moveTo(40, 200); x.lineTo(140, 150); x.lineTo(220, 170); x.lineTo(330, 80); x.stroke();
    x.fillStyle = '#dc2626'; x.font = 'bold 26px "Comic Sans MS", cursive'; x.fillText('DESTROY DJB', 280, 220);
    x.fillStyle = '#111827'; x.font = '22px "Comic Sans MS", cursive'; x.fillText('- synergy', 40, 100); x.fillText('- more coffee', 40, 130);
    return toTexture(c, { repeat: false });
  }),

  poster: (text, bg, fg) => cached('poster' + text, () => {
    const [c, x] = makeCanvas(256, 360);
    x.fillStyle = bg; x.fillRect(0, 0, 256, 360);
    x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(14, 14, 228, 332);
    x.fillStyle = fg; x.textAlign = 'center';
    const lines = text.split('\n');
    x.font = 'bold 40px Impact, Arial';
    lines.forEach((l, i) => x.fillText(l, 128, 150 + i * 48 - (lines.length - 1) * 20));
    return toTexture(c, { repeat: false });
  }),

  logo: (text, color) => cached('logo' + text, () => {
    const [c, x] = makeCanvas(1024, 256);
    x.clearRect(0, 0, 1024, 256);
    x.fillStyle = color; x.font = '900 170px Impact, "Arial Black", Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 512, 138);
    return toTexture(c, { repeat: false });
  }),

  decal: () => cached('decal', () => {
    const [c, x] = makeCanvas(64, 64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.22, 'rgba(10,10,10,.95)');
    g.addColorStop(0.35, 'rgba(40,36,30,.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return toTexture(c, { repeat: false });
  }),

  soft: () => cached('soft', () => {
    const [c, x] = makeCanvas(128, 128);
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    return toTexture(c, { repeat: false });
  }),

  flash: () => cached('flash', () => {
    const [c, x] = makeCanvas(128, 128);
    x.translate(64, 64);
    for (let i = 0; i < 7; i++) {
      x.rotate(Math.PI * 2 / 7 + 0.3);
      const g = x.createLinearGradient(0, 0, 60, 0);
      g.addColorStop(0, 'rgba(255,250,210,1)'); g.addColorStop(1, 'rgba(255,140,20,0)');
      x.fillStyle = g; x.beginPath(); x.moveTo(0, -7); x.lineTo(62, 0); x.lineTo(0, 7); x.fill();
    }
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 34);
    g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(1, 'rgba(255,170,40,0)');
    x.fillStyle = g; x.beginPath(); x.arc(0, 0, 34, 0, 7); x.fill();
    return toTexture(c, { repeat: false });
  }),
};

// Height and roughness are data maps, never sRGB colour. Millimetre-scale bump
// amplitudes below retain texture detail without turning carpet into deep ridges.
export function bumpOf(tex) {
  return cached('bump:' + tex.uuid, () => {
    const [c, ctx] = makeCanvas(tex.image.width, tex.image.height);
    ctx.drawImage(tex.image, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const value = img.data[i] * 0.2126 + img.data[i + 1] * 0.7152 + img.data[i + 2] * 0.0722;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
    }
    ctx.putImageData(img, 0, 0);
    const t = toTexture(c, { srgb: false });
    t.userData.meters = tex.userData.meters;
    return t;
  });
}

function roughnessOf(tex, base, variation = 0.15) {
  return cached(`rough:${tex.uuid}:${base}`, () => {
    const [c, ctx] = makeCanvas(tex.image.width, tex.image.height);
    ctx.drawImage(bumpOf(tex).image, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const value = THREE.MathUtils.clamp(base + (img.data[i] / 255 - 0.5) * variation, 0, 1) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

let lib = null;
export function materials() {
  if (lib) return lib;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const tex = (t, o = {}) => {
    const m = std({ map: t, ...o, roughnessMap: roughnessOf(t, o.roughness ?? 0.8), roughness: 1 });
    m.userData.meters = t.userData.meters || 1;
    return m;
  };
  lib = {
    carpet: tex(TEX.carpet(), { roughness: 0.96, bumpMap: bumpOf(TEX.carpet()), bumpScale: 0.025 }),
    ceiling: tex(TEX.ceiling(), { roughness: 0.94, bumpMap: bumpOf(TEX.ceiling()), bumpScale: 0.015 }),
    drywall: tex(TEX.drywall(), { roughness: 0.86, bumpMap: bumpOf(TEX.drywall()), bumpScale: 0.008 }),
    accentWall: tex(TEX.paintBlue(), { roughness: 0.76, bumpMap: bumpOf(TEX.paintBlue()), bumpScale: 0.006 }),
    wood: tex(TEX.wood(), { roughness: 0.48, metalness: 0, bumpMap: bumpOf(TEX.wood()), bumpScale: 0.006 }),
    darkWood: tex(TEX.darkWood(), { roughness: 0.46, bumpMap: bumpOf(TEX.wood()), bumpScale: 0.006 }),
    concrete: tex(TEX.concrete(), { roughness: 0.86, bumpMap: bumpOf(TEX.concrete()), bumpScale: 0.025 }),
    tiles: tex(TEX.tiles(), { roughness: 0.3, bumpMap: bumpOf(TEX.tiles()), bumpScale: 0.008 }),
    fabric: tex(TEX.fabric(), { roughness: 0.95, bumpMap: bumpOf(TEX.fabric()), bumpScale: 0.012 }),
    fabricOrange: tex(TEX.fabric(), { roughness: 1, color: 0xffb070 }),
    fabricBlue: tex(TEX.fabric(), { roughness: 1, color: 0x9cc3ff }),
    metal: tex(TEX.metal(), { roughness: 0.38, metalness: 0.78, bumpMap: bumpOf(TEX.metal()), bumpScale: 0.003 }),
    darkMetal: std({ color: 0x343b3b, roughness: 0.53, metalness: 0.6, roughnessMap: roughnessOf(TEX.metal(), 0.8) }),
    blackPlastic: std({ color: 0x15171b, roughness: 0.55, metalness: 0.05 }),
    greyPlastic: std({ color: 0x9aa0a8, roughness: 0.6, metalness: 0.05 }),
    whitePlastic: std({ color: 0xe8e8e4, roughness: 0.5, metalness: 0 }),
    chrome: std({ color: 0xd8dde3, roughness: 0.15, metalness: 1 }),
    frame: std({ color: 0x3a3f47, roughness: 0.4, metalness: 0.8 }),
    baseboard: std({ color: 0x2a2d33, roughness: 0.6 }),
    leather: std({ color: 0x1c1a19, roughness: 0.45 }),
    red: std({ color: 0xb91c1c, roughness: 0.4, metalness: 0.2 }),
    plantPot: std({ color: 0x3b3b3b, roughness: 0.8 }),
    leaf: std({ color: 0x2f7a34, roughness: 0.75, side: THREE.DoubleSide }),
    leafDark: std({ color: 0x1e5a25, roughness: 0.8, side: THREE.DoubleSide }),
    lightPanel: std({ map: TEX.lightLens(), emissiveMap: TEX.lightLens(), color: 0xffffff, emissive: 0xfff2d9, emissiveIntensity: 1.8, roughness: 0.42 }),
    vent: std({ map: TEX.vent(), roughness: 0.64, metalness: 0.28 }),
    contactShadow: new THREE.MeshBasicMaterial({ map: TEX.contactShadow(), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false }),
    windowLight: new THREE.MeshBasicMaterial({ map: TEX.windowLight(), transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -1, toneMapped: false }),
    roomSigns: Object.fromEntries([
      ['conference', 'CONFERENCE', '04 / 01'], ['reception', 'RECEPTION', '04 / 02'], ['office', 'DIRECTOR', '04 / 03'],
      ['kitchen', 'BREAK ROOM', '04 / 04'], ['print', 'PRINT & COPY', '04 / 05'], ['server', 'SERVER ACCESS', '04 / 06'],
      ['garage', 'AUTOMOTIVE', 'WEST / SERVICE'], ['lounge', 'DJB OFFICES', 'EAST / OPERATIONS'],
    ].map(([key, label, number]) => [key, std({ map: TEX.sign(label, number), roughness: 0.55, metalness: 0.15 })])),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xc8d9d4, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.13,
      envMapIntensity: 1.0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    }),
    city: new THREE.MeshBasicMaterial({ map: TEX.city(), toneMapped: false, color: 0xd8e2ea }),
    rack: std({ map: TEX.rack(), emissiveMap: TEX.rack(), emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.5, metalness: 0.4 }),
    whiteboard: std({ map: TEX.whiteboard(), roughness: 0.25 }),
    screens: Array.from({ length: 6 }, (_, i) => std({
      map: TEX.screen(i), emissiveMap: TEX.screen(i), emissive: 0xffffff, emissiveIntensity: 0.48, roughness: 0.25,
    })),
    posters: [
      std({ map: TEX.poster('SYNERGY\nOR DEATH', '#0f172a', '#fbbf24'), roughness: 0.6 }),
      std({ map: TEX.poster('HANG IN\nTHERE', '#1e3a8a', '#f8fafc'), roughness: 0.6 }),
      std({ map: TEX.poster('RH IS\nWATCHING', '#7f1d1d', '#fecaca'), roughness: 0.6 }),
      std({ map: TEX.poster('Q4 OR\nDIE', '#14532d', '#bbf7d0'), roughness: 0.6 }),
    ],
    logoAuto: new THREE.MeshStandardMaterial({ map: TEX.logo('AUTOMOTIVE', '#ff7a1a'), transparent: true, roughness: 0.5, emissive: 0xff7a1a, emissiveIntensity: 0.25, emissiveMap: TEX.logo('AUTOMOTIVE', '#ff7a1a') }),
    logoDjb: new THREE.MeshStandardMaterial({ map: TEX.logo('DJB', '#2f8cff'), transparent: true, roughness: 0.5, emissive: 0x2f8cff, emissiveIntensity: 0.25, emissiveMap: TEX.logo('DJB', '#2f8cff') }),
    orangeTrim: std({ color: 0xc67936, roughness: 0.58 }),
    blueTrim: std({ color: 0x47738b, roughness: 0.58 }),
  };
  return lib;
}
