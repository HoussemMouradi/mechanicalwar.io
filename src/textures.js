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

// Periodic value noise has no hard boundary when a material repeats across a
// floor or a desk. The small grids are only retained while building the maps.
function noiseField(size, cellsX, cellsY, seed) {
  const r = rand(seed), grid = new Float32Array(cellsX * cellsY);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  const result = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const gy = y / size * cellsY, iy = Math.floor(gy), fy = gy - iy;
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < size; x++) {
      const gx = x / size * cellsX, ix = Math.floor(gx), fx = gx - ix;
      const sx = fx * fx * (3 - 2 * fx);
      const a = grid[iy * cellsX + ix], b = grid[iy * cellsX + (ix + 1) % cellsX];
      const c = grid[(iy + 1) % cellsY * cellsX + ix], d = grid[(iy + 1) % cellsY * cellsX + (ix + 1) % cellsX];
      result[y * size + x] = (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    }
  }
  return result;
}

const SURFACES = {
  carpet: { size: 512, meters: 2, color: [102, 104, 98], roughness: 0.96, relief: 0.005, seed: 7 },
  ceiling: { size: 256, meters: 1.2, color: [210, 208, 202], roughness: 0.94, relief: 0.003, seed: 11 },
  drywall: { size: 512, meters: 2.5, color: [203, 200, 187], roughness: 0.86, relief: 0.001, seed: 9 },
  paintBlue: { size: 256, meters: 2, color: [43, 64, 88], roughness: 0.76, relief: 0.0008, seed: 4 },
  wood: { size: 512, meters: 1.6, color: [166, 120, 79], roughness: 0.48, relief: 0.0015, seed: 21 },
  concrete: { size: 512, meters: 4, color: [139, 141, 143], roughness: 0.86, relief: 0.006, seed: 31 },
  tiles: { size: 512, meters: 1.2, color: [224, 223, 215], roughness: 0.3, relief: 0.004, seed: 41 },
  fabric: { size: 256, meters: 0.8, color: [91, 101, 115], roughness: 0.95, relief: 0.0018, seed: 51 },
  metal: { size: 256, meters: 1, color: [128, 136, 144], roughness: 0.38, relief: 0.001, seed: 61 },
};

// Colour, relief and roughness describe the same physical features, but are not
// derived from one another. A dark tile is just as high as a light tile; polished
// ceramic is smooth while its grout is rough. No downloaded assets are needed.
function makeSurface(kind) {
  const p = SURFACES[kind], { size, meters } = p, tau = Math.PI * 2;
  const [canvas, ctx] = makeCanvas(size, size);
  const [heightCanvas, heightCtx] = makeCanvas(size, size);
  const [roughCanvas, roughCtx] = makeCanvas(size, size);
  const color = ctx.createImageData(size, size), height = heightCtx.createImageData(size, size);
  const rough = roughCtx.createImageData(size, size);
  const broad = noiseField(size, 8, 8, p.seed), fine = noiseField(size, 128, 128, p.seed + 1);
  const brush = kind === 'metal' ? noiseField(size, 4, 128, p.seed + 2) : null;
  const r = rand(p.seed + 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const index = y * size + x, i = index * 4, u = x / size, v = y / size;
    const cloud = broad[index] - 0.5, grain = fine[index] - 0.5, speckle = r() - 0.5;
    let shade = cloud * 7 + speckle * 5, h = 0.5, roughness = p.roughness;
    let red = p.color[0], green = p.color[1], blue = p.color[2];
    if (kind === 'carpet') {
      const tileSize = size / 4, tx = Math.floor(x / tileSize), ty = Math.floor(y / tileSize);
      const quarterTurn = (tx + ty) % 2, across = quarterTurn ? y : x, along = quarterTurn ? x : y;
      const rib = Math.cos(across * tau / 4), loop = Math.sin(along * tau / 8 + rib * 0.7);
      const edge = Math.min(x % tileSize, tileSize - x % tileSize, y % tileSize, tileSize - y % tileSize);
      const seam = 1 - THREE.MathUtils.smoothstep(edge, 0, 1.5);
      shade = cloud * 8 + grain * 7 + speckle * 12 + rib * 2 + quarterTurn * 2 - seam * 9;
      h = 0.56 + rib * 0.08 + loop * 0.04 + grain * 0.08 + speckle * 0.08 - seam * 0.2;
      roughness += cloud * 0.03 + grain * 0.02;
    } else if (kind === 'wood') {
      const warp = v + Math.sin(u * tau) * 0.009 + Math.sin((u * 3 + v) * tau) * 0.003;
      const growth = Math.sin(warp * tau * 42 + cloud * 2.4);
      const pore = Math.pow(Math.max(0, Math.sin(warp * tau * 86 + cloud * 3)), 12);
      const worn = Math.max(0, cloud + 0.1);
      shade = growth * 5 - pore * 10 + cloud * 18 + speckle * 3;
      h = 0.58 - pore * 0.18 + grain * 0.04 + speckle * 0.025;
      roughness += pore * 0.045 + worn * 0.14 + grain * 0.025 - 0.025;
    } else if (kind === 'concrete') {
      const panel = size / 2, edge = Math.min(x % panel, panel - x % panel, y % panel, panel - y % panel);
      const joint = 1 - THREE.MathUtils.smoothstep(edge, 0, 2);
      const pore = Math.max(0, -grain - 0.17) * 2.5;
      shade = cloud * 22 + grain * 9 + speckle * 12 - joint * 23 - pore * 14;
      h = 0.58 + grain * 0.08 + speckle * 0.045 - pore * 0.3 - joint * 0.32;
      roughness += cloud * 0.08 + pore * 0.12 + joint * 0.07;
    } else if (kind === 'tiles') {
      const tileSize = size / 4, tx = Math.floor(x / tileSize), ty = Math.floor(y / tileSize);
      const edge = Math.min(x % tileSize, tileSize - x % tileSize, y % tileSize, tileSize - y % tileSize);
      const face = THREE.MathUtils.smoothstep(edge, 1.5, 4);
      const dark = (tx + ty) % 2 === 0, tileTone = Math.sin(tx * 7 + ty * 13) * 2;
      red = THREE.MathUtils.lerp(130, dark ? 76 : 224, face);
      green = THREE.MathUtils.lerp(134, dark ? 84 : 223, face);
      blue = THREE.MathUtils.lerp(131, dark ? 88 : 215, face);
      shade = cloud * 4 + speckle * (1 - face) * 11 + tileTone * face;
      h = 0.22 + face * 0.62 + speckle * 0.018 * (1 - face);
      roughness = THREE.MathUtils.lerp(0.88 + grain * 0.08, p.roughness + cloud * 0.055, face);
    } else if (kind === 'metal') {
      const brushed = brush[index] - 0.5;
      const scuff = Math.max(0, cloud - 0.16) * 2;
      shade = brushed * 13 + speckle * 3 + cloud * 4 + scuff * 3;
      h = 0.5 + brushed * 0.09 + speckle * 0.02;
      roughness += brushed * 0.16 + scuff * 0.16;
    } else if (kind === 'fabric') {
      const warp = Math.cos(x * tau / 4), weft = Math.cos(y * tau / 4);
      const over = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
      const weave = over ? warp * 0.7 + weft * 0.3 : warp * 0.3 + weft * 0.7;
      shade = weave * 4 + cloud * 6 + speckle * 9;
      h = 0.5 + weave * 0.13 + speckle * 0.045;
      roughness += grain * 0.035;
    } else if (kind === 'ceiling') {
      const panel = size / 2, edge = Math.min(x % panel, panel - x % panel, y % panel, panel - y % panel);
      const rail = 1 - THREE.MathUtils.smoothstep(edge, 2, 3.5);
      const pore = Math.max(0, -grain - 0.1) * 1.8;
      shade = cloud * 5 + speckle * 5 - pore * 28 - rail * 20;
      h = 0.5 - pore * 0.25 + rail * 0.3 + speckle * 0.02;
      roughness -= rail * 0.14;
    } else {
      // Paint stipple is shallow; stains affect colour/roughness, not wall shape.
      h = 0.5 + grain * 0.16 + speckle * 0.05;
      roughness += cloud * 0.055 + grain * 0.035;
    }
    color.data[i] = red + shade; color.data[i + 1] = green + shade; color.data[i + 2] = blue + shade; color.data[i + 3] = 255;
    height.data[i] = height.data[i + 1] = height.data[i + 2] = THREE.MathUtils.clamp(h, 0, 1) * 255;
    rough.data[i] = rough.data[i + 1] = rough.data[i + 2] = THREE.MathUtils.clamp(roughness, 0.04, 1) * 255;
    height.data[i + 3] = rough.data[i + 3] = 255;
  }
  ctx.putImageData(color, 0, 0); heightCtx.putImageData(height, 0, 0); roughCtx.putImageData(rough, 0, 0);
  const t = toTexture(canvas), heightMap = toTexture(heightCanvas, { srgb: false }), roughMap = toTexture(roughCanvas, { srgb: false });
  t.userData = { meters, surface: kind, reliefMeters: p.relief, roughness: p.roughness };
  heightMap.userData.meters = roughMap.userData.meters = meters;
  cache.set('bump:' + t.uuid, heightMap);
  cache.set('surfaceRough:' + t.uuid, roughMap);
  return t;
}

// Each texture reports `meters`: the world size covered by one repeat, used by world-space UVs.
export const TEX = {
  carpet: () => cached('carpet', () => makeSurface('carpet')),
  ceiling: () => cached('ceiling', () => makeSurface('ceiling')),
  drywall: () => cached('drywall', () => makeSurface('drywall')),
  paintBlue: () => cached('paintBlue', () => makeSurface('paintBlue')),
  wood: () => cached('wood', () => makeSurface('wood')),
  darkWood: () => cached('darkWood', () => {
    const source = TEX.wood(), [c, x] = makeCanvas(512, 512);
    x.drawImage(source.image, 0, 0);
    x.fillStyle = 'rgba(40,18,8,.62)'; x.fillRect(0, 0, 512, 512);
    const t = toTexture(c); t.userData = { ...source.userData };
    // Dark stain changes the albedo, not the grain's shape or its finish.
    cache.set('bump:' + t.uuid, bumpOf(source));
    cache.set('surfaceRough:' + t.uuid, cache.get('surfaceRough:' + source.uuid));
    return t;
  }),
  concrete: () => cached('concrete', () => makeSurface('concrete')),
  tiles: () => cached('tiles', () => makeSurface('tiles')),
  fabric: () => cached('fabric', () => makeSurface('fabric')),
  metal: () => cached('metal', () => makeSurface('metal')),

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

// Height, normal and roughness maps are linear data, never sRGB colour. The
// grayscale fallback keeps bumpOf useful for non-surface textures and decals.
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
    const t = toTexture(c, { srgb: false, repeat: tex.wrapS === THREE.RepeatWrapping });
    t.userData.meters = tex.userData.meters;
    return t;
  });
}

export function normalOf(tex) {
  return cached('normal:' + tex.uuid, () => {
    const height = bumpOf(tex).image, w = height.width, h = height.height;
    const data = height.getContext('2d').getImageData(0, 0, w, h).data;
    const [c, ctx] = makeCanvas(w, h), img = ctx.createImageData(w, h);
    const repeat = tex.wrapS === THREE.RepeatWrapping;
    const relief = tex.userData.reliefMeters ?? 0.001;
    const scaleX = relief * w / (tex.userData.meters || 1) / 2;
    const scaleY = relief * h / (tex.userData.meters || 1) / 2;
    const sample = (x, y) => {
      const sx = repeat ? (x + w) % w : THREE.MathUtils.clamp(x, 0, w - 1);
      const sy = repeat ? (y + h) % h : THREE.MathUtils.clamp(y, 0, h - 1);
      return data[(sy * w + sx) * 4] / 255;
    };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * scaleX;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * scaleY;
      const length = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      // Canvas Y runs downwards; the flipped texture's tangent V runs up.
      img.data[i] = (0.5 - dx / length * 0.5) * 255;
      img.data[i + 1] = (0.5 + dy / length * 0.5) * 255;
      img.data[i + 2] = (0.5 + 1 / length * 0.5) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = toTexture(c, { srgb: false, repeat });
    t.userData.meters = tex.userData.meters;
    return t;
  });
}

function roughnessOf(tex, base, variation = 0.15) {
  const profile = cache.get('surfaceRough:' + tex.uuid);
  if (profile && base === tex.userData.roughness) return profile;
  return cached(`rough:${tex.uuid}:${base}:${variation}`, () => {
    const [c, ctx] = makeCanvas(tex.image.width, tex.image.height);
    ctx.drawImage((profile || bumpOf(tex)).image, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const sampled = img.data[i] / 255;
      const value = THREE.MathUtils.clamp(profile ? sampled + base - tex.userData.roughness : base + (sampled - 0.5) * variation, 0.04, 1) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = value;
    }
    ctx.putImageData(img, 0, 0);
    const t = toTexture(c, { srgb: false, repeat: tex.wrapS === THREE.RepeatWrapping });
    t.userData.meters = tex.userData.meters;
    return t;
  });
}

let lib = null;
export function materials() {
  if (lib) return lib;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const tex = (t, o = {}) => {
    const m = std({ map: t, normalMap: o.normalMap || normalOf(t), ...o, roughnessMap: roughnessOf(t, o.roughness ?? 0.8), roughness: 1 });
    m.userData.meters = t.userData.meters || 1;
    return m;
  };
  lib = {
    carpet: tex(TEX.carpet(), { roughness: 0.96 }),
    ceiling: tex(TEX.ceiling(), { roughness: 0.94 }),
    drywall: tex(TEX.drywall(), { roughness: 0.86 }),
    accentWall: tex(TEX.paintBlue(), { roughness: 0.76 }),
    wood: tex(TEX.wood(), { roughness: 0.48, metalness: 0 }),
    darkWood: tex(TEX.darkWood(), { roughness: 0.46, normalMap: normalOf(TEX.wood()) }),
    concrete: tex(TEX.concrete(), { roughness: 0.86 }),
    tiles: tex(TEX.tiles(), { roughness: 0.3 }),
    fabric: tex(TEX.fabric(), { roughness: 0.95 }),
    fabricOrange: tex(TEX.fabric(), { roughness: 1, color: 0xffb070 }),
    fabricBlue: tex(TEX.fabric(), { roughness: 1, color: 0x9cc3ff }),
    metal: tex(TEX.metal(), { roughness: 0.38, metalness: 0.85 }),
    darkMetal: std({ color: 0x343b3b, roughness: 1, metalness: 0.6, normalMap: normalOf(TEX.metal()), roughnessMap: roughnessOf(TEX.metal(), 0.53) }),
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
