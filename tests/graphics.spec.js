const { test, expect } = require('@playwright/test');
const { localRuntime } = require('./local-runtime');
const { execFileSync } = require('node:child_process');

async function launch(page, context, quality) {
  await localRuntime(context);
  await context.route('**/*peerjs*.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.Peer = undefined;' }));
  await page.addInitScript(quality => {
    localStorage.setItem('mw.settings.v4', JSON.stringify({ sensitivity: 1, fov: 80, quality, volume: 0 }));
    localStorage.setItem('mw.name', 'Graphics QA');
    localStorage.setItem('mw.team', '1');
  }, quality);
  await page.goto('/');
  await page.click('#play');
  await page.waitForFunction(() => window.mw?.game?.ready, null, { timeout: 45000 });
  // Freeze simulation, not rendering assertions. This makes repeatable, exact
  // camera comparisons possible on slow software GPUs without input races.
  await page.evaluate(() => {
    const g = window.mw.game;
    g.disposed = true;
    g.worker?.terminate(); clearInterval(g.tickTimer);
    g.me.pos.set(-11, 0, 9); g.me.yaw = -0.7; g.me.pitch = -0.04;
    g.updateCamera(1); g.updateViewmodel(0); g.setPaused(false);
    document.getElementById('pause').classList.add('hide');
    document.getElementById('toasts').replaceChildren();
    g.render();
  });
}

for (const quality of ['low', 'medium', 'high', 'ultra']) {
  test(`${quality}: render, resize, scope and transparent smoke stay correct`, async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await launch(page, context, quality);
    const before = await page.evaluate(() => {
      const g = window.mw.game;
      return { post: !!g.composer, ratio: g.renderer.getPixelRatio(), canvas: [g.renderer.domElement.width, g.renderer.domElement.height],
        target: g.composer && [g.composer.readBuffer.width, g.composer.readBuffer.height],
        ao: g.aoPass && [g.aoPass.width, g.aoPass.height], scale: g.quality.aoScale };
    });
    expect(before.post).toBe(['high', 'ultra'].includes(quality));
    expect(before.canvas).toEqual([Math.floor(640 * before.ratio), Math.floor(360 * before.ratio)]);
    if (before.post) {
      expect(before.target).toEqual(before.canvas);
      expect(before.ao).toEqual(before.canvas.map(size => Math.round(size * before.scale)));
    }
    await page.setViewportSize({ width: 760, height: 420 });
    const state = await page.evaluate(async () => {
      const g = window.mw.game;
      g.onResize(); g.applySettings({ ...g.settings, fov: 22 });
      g.smokeEffects.add('graphics-smoke', [0, 0, 0], 4.5, 16);
      g.smokeEffects.update(1, g.camera);
      const cloud = g.smokeEffects.clouds.get('graphics-smoke').group;
      const visibles = [];
      g.scene.traverse(o => { if (o.material?.transparent) visibles.push([o, o.visible]); });
      g.render();
      const projection = !g.aoPass || g.aoPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.equals(g.camera.projectionMatrix);
      const restored = visibles.every(([o, visible]) => o.visible === visible);
      const passes = g.composer?.passes.map(p => p.constructor.name);
      const sizes = [g.renderer.domElement.width, g.renderer.domElement.height];
      const target = g.composer && [g.composer.readBuffer.width, g.composer.readBuffer.height];
      const pixels = new Uint8Array(4 * sizes[0] * sizes[1]);
      const gl = g.renderer.getContext();
      gl.readPixels(0, 0, ...sizes, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let lit = 0; for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 50) lit++;
      let transparencyUnaffected = true;
      if (g.aoPass) {
        // A fully dense transparent surface must not inherit background AO.
        // Force a dark AO texture to make this regression independent of scene
        // geometry, random SSAO samples and the software GPU's edge precision.
        const THREE = await import('three');
        const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 1 }));
        overlay.position.copy(g.camera.position).addScaledVector(g.camera.getWorldDirection(new THREE.Vector3()), 0.25);
        overlay.quaternion.copy(g.camera.quaternion); g.scene.add(overlay);
        const sample = () => { const p = new Uint8Array(4); g.render(); gl.readPixels(Math.floor(sizes[0] / 2), Math.floor(sizes[1] / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
        g.aoPass.enabled = false;
        const original = sample();
        g.aoPass.enabled = true;
        const shader = g.aoPass.blurMaterial.fragmentShader;
        g.aoPass.blurMaterial.fragmentShader = 'void main() { gl_FragColor = vec4(0.2, 0.2, 0.2, 1.0); }';
        g.aoPass.blurMaterial.needsUpdate = true;
        const withAO = sample();
        transparencyUnaffected = original.every((v, i) => Math.abs(v - withAO[i]) <= 1);
        g.aoPass.blurMaterial.fragmentShader = shader; g.aoPass.blurMaterial.needsUpdate = true;
        g.scene.remove(overlay); overlay.geometry.dispose(); overlay.material.dispose();
      }
      g.smokeEffects.clear();
      g.applySettings({ ...g.settings, fov: 80 }); g.render();
      return { transparencyUnaffected, projection, restored, cloud: !!cloud, shadows: g.renderer.shadowMap.autoUpdate, passes, sizes, target, lit, error: gl.getError() };
    });
    expect(state.transparencyUnaffected).toBe(true);
    expect(state.projection).toBe(true);
    expect(state.restored).toBe(true);
    expect(state.cloud).toBe(true);
    expect(state.shadows).toBe(true);
    expect(state.lit).toBeGreaterThan(1000);
    expect(state.error).toBe(0);
    if (before.post) {
      expect(state.target).toEqual(state.sizes);
      expect(state.passes).toEqual(['OfficeWorldPass', 'OfficeAOPass', 'OfficeWorldPass', 'UnrealBloomPass', 'RenderPass', 'OutputPass']);
    }
    await page.screenshot({ path: testInfo.outputPath(`${quality}-office.png`) });
    expect(errors).toEqual([]);
    await context.close();
  });
}

test('mobile low keeps controls, cached PBR maps and non-HDR rendering', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await launch(page, context, 'low');
  const state = await page.evaluate(async () => {
    const { materials, TEX } = await import('/src/textures.js');
    const m = materials(), g = window.mw.game;
    const before = TEX.carpet().image.toDataURL();
    return { touch: !!g.touch, post: !!g.composer, shadows: g.renderer.shadowMap.enabled,
      maps: ['carpet', 'wood', 'concrete', 'tiles', 'metal'].map(k => ({ key: k, normal: !!m[k].normalMap, rough: !!m[k].roughnessMap,
        linear: m[k].normalMap?.colorSpace === '' && m[k].roughnessMap?.colorSpace === '', cached: TEX[k]() === TEX[k]() })),
      stable: before === TEX.carpet().image.toDataURL() };
  });
  expect(state.touch).toBe(true);
  expect(state.post).toBe(false);
  expect(state.shadows).toBe(false);
  expect(state.stable).toBe(true);
  for (const map of state.maps) expect(map).toEqual({ key: map.key, normal: true, rough: true, linear: true, cached: true });
  await page.screenshot({ path: testInfo.outputPath('mobile-low-office.png') });
  await context.close();
});

test('matched-camera high-quality review screenshots', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await launch(page, context, 'high');
  const renderTime = async target => target.evaluate(() => {
    const g = window.mw.game, gl = g.renderer.getContext();
    g.render(); gl.finish();
    const samples = [];
    for (let i = 0; i < 3; i++) { const start = performance.now(); g.render(); gl.finish(); samples.push(performance.now() - start); }
    return { samplesMs: samples, vendor: gl.getParameter(gl.VERSION), preset: g.settings.quality, resolution: [g.renderer.domElement.width, g.renderer.domElement.height] };
  });
  const timings = { after: await renderTime(page) };
  await page.screenshot({ path: testInfo.outputPath('office-after.png') });
  await page.evaluate(() => {
    const g = window.mw.game;
    g.me.pos.set(-15, 0, 19); g.me.yaw = -0.5; g.me.pitch = -0.18;
    g.updateCamera(1); g.render();
  });
  await page.screenshot({ path: testInfo.outputPath('kitchen-after.png') });
  await context.close();
  // CI attaches an exact base-commit comparison, with the same camera and GPU.
  const base = process.env.GRAPHICS_BASE_REF;
  if (base && /^[a-f0-9]{40}$/.test(base)) {
    const baseline = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await baseline.route('http://127.0.0.1:4173/**', route => {
      const file = new URL(route.request().url()).pathname.slice(1) || 'index.html';
      if (!/^(index\.html|styles\.css|src\/[a-z-]+\.js)$/.test(file)) return route.continue();
      const body = execFileSync('git', ['show', `${base}:${file}`]);
      return route.fulfill({ body, contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' });
    });
    const oldPage = await baseline.newPage();
    await launch(oldPage, baseline, 'high');
    timings.before = await renderTime(oldPage);
    await oldPage.screenshot({ path: testInfo.outputPath('office-before.png') });
    await oldPage.evaluate(() => {
      const g = window.mw.game;
      g.me.pos.set(-15, 0, 19); g.me.yaw = -0.5; g.me.pitch = -0.18;
      g.updateCamera(1); g.render();
    });
    await oldPage.screenshot({ path: testInfo.outputPath('kitchen-before.png') });
    await baseline.close();
  }
  await testInfo.attach('matched-render-timings', { body: JSON.stringify(timings, null, 2), contentType: 'application/json' });
});
