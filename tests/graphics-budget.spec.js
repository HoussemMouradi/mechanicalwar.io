const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
let THREE, OfficeAOPass, OfficeWorldPass, renderPixelRatio, QUALITY;
test.beforeAll(async () => {
  const root = path.resolve(path.dirname(require.resolve('three')), '..');
  const three = pathToFileURL(path.join(root, 'build/three.module.js')).href;
  const renderPass = pathToFileURL(path.join(root, 'examples/jsm/postprocessing/RenderPass.js')).href;
  const ssao = pathToFileURL(path.join(root, 'examples/jsm/postprocessing/SSAOPass.js')).href;
  const source = fs.readFileSync(path.join(__dirname, '../src/graphics.js'), 'utf8').replace("'three'", JSON.stringify(three)).replace("'three/addons/postprocessing/SSAOPass.js'", JSON.stringify(ssao)).replace("'three/addons/postprocessing/RenderPass.js'", JSON.stringify(renderPass));
  THREE = await import(three);
  ({ OfficeAOPass, OfficeWorldPass, renderPixelRatio } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')));
  ({ QUALITY } = await import('data:text/javascript;base64,' + Buffer.from(fs.readFileSync(path.join(__dirname, '../src/config.js'))).toString('base64')));
});

test('retina/4K rendering stays within each preset pixel budget', () => {
  for (const q of Object.values(QUALITY)) for (const [w, h, dpr] of [[1280, 720, 1], [844, 390, 3], [3840, 2160, 2], [1, 1, 1]]) {
    const ratio = renderPixelRatio(q, w, h, dpr);
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(Math.min(dpr, q.pixelRatio));
    expect(w * h * ratio * ratio).toBeLessThanOrEqual(q.maxPixels + 0.01);
  }
});

test('AO targets are bounded and transparencies/hidden players restore exactly', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(80, 1, 0.05, 400);
  const opaque = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const glass = new THREE.Mesh(opaque.geometry, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2 }));
  const hidden = opaque.clone(); hidden.visible = false;
  scene.add(opaque, glass, hidden);
  const pass = new OfficeAOPass(scene, camera, QUALITY.ultra);
  pass.setSize(7680, 4320);
  expect(pass.width).toBe(1600); expect(pass.height).toBe(900);
  pass.overrideVisibility();
  expect(opaque.visible).toBe(true); expect(glass.visible).toBe(false); expect(hidden.visible).toBe(false);
  pass.restoreVisibility();
  expect(opaque.visible).toBe(true); expect(glass.visible).toBe(true); expect(hidden.visible).toBe(false);
  expect(pass._visibilityCache.size).toBe(0);
  pass.dispose();
});


test('transparent overlay preserves opaque depth and restores shared material state', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color('white');
  const solid = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  const smoke = new THREE.Mesh(solid.geometry, new THREE.MeshBasicMaterial({ transparent: true }));
  const shared = smoke.clone();
  solid.add(smoke); scene.add(solid, shared);
  const pass = new OfficeWorldPass(scene, camera, true), buffer = {};
  const originalBackground = scene.background;
  let rendered = false;
  const renderer = {
    autoClear: true, shadowMap: { autoUpdate: true },
    setRenderTarget: target => expect(target).toBe(buffer),
    render: () => {
      expect(solid.material.visible).toBe(false);
      expect(smoke.material.visible).toBe(true);
      expect(solid.visible).toBe(true); // children can still render
      expect(scene.background).toBeNull();
      expect(renderer.shadowMap.autoUpdate).toBe(false);
      rendered = true;
    },
    clear: () => { throw new Error('transparent overlay must retain opaque depth'); },
    clearDepth: () => { throw new Error('transparent overlay must retain opaque depth'); },
  };
  pass.render(renderer, {}, buffer);
  expect(rendered).toBe(true);
  expect(scene.background).toBe(originalBackground);
  expect(solid.material.visible).toBe(true);
  expect(smoke.material.visible).toBe(true);
  expect(renderer.shadowMap.autoUpdate).toBe(true);
});
