const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Use real Three geometry and volume math without allocating a WebGL renderer.
// The regression is snapshot/lifetime behavior, independent of browser timing.
let THREE, SmokeEffects;
test.beforeAll(async () => {
  const threeUrl = pathToFileURL(path.join(path.dirname(require.resolve('three')), 'three.module.js')).href;
  THREE = await import(threeUrl);
  const source = fs.readFileSync(path.join(__dirname, '../src/supplies.js'), 'utf8').replace("'three'", JSON.stringify(threeUrl));
  ({ SmokeEffects } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')));
});

test('repeated snapshots retain all smoke lifetimes and occlusion beyond the visual budget', () => {
  const scene = new THREE.Scene();
  const smoke = new SmokeEffects(scene);
  const camera = { position: new THREE.Vector3(0, 1, 0) };
  const positions = Array.from({ length: 24 }, (_, i) => [i * 12, 0, 0]);
  for (let frame = 0; frame < 40; frame++) {
    for (let i = 0; i < positions.length; i++) smoke.add(`cloud-${i}`, positions[i], 4, 16 - frame * 0.05);
    smoke.update(0.05, camera);
    expect(scene.children.length).toBeLessThanOrEqual(12);
  }
  expect(smoke.clouds.size).toBe(24);
  for (const c of smoke.clouds.values()) {
    expect(c.age).toBeCloseTo(2);
    expect(c.density).toBe(1);
  }
  const far = smoke.clouds.get('cloud-23');
  expect(far.group).toBeNull();
  expect(smoke.obscures(new THREE.Vector3(271, 1.12, 0), new THREE.Vector3(281, 1.12, 0))).toBe(true);

  // Unchanged snapshots retain visual objects, instead of reallocating them.
  const oldGroups = new Map([...smoke.clouds].map(([id, c]) => [id, c.group]));
  for (let i = 0; i < positions.length; i++) smoke.add(`cloud-${i}`, positions[i], 4, 14);
  smoke.update(0, camera);
  for (const [id, c] of smoke.clouds) expect(c.group).toBe(oldGroups.get(id));

  // Moving into a previously unrendered cloud allocates its visual without
  // restarting its mature density, and releases the old distant visuals.
  camera.position.copy(far.center);
  expect(smoke.update(0, camera)).toBeGreaterThan(0.9);
  expect(far.group).not.toBeNull();
  expect(far.age).toBeCloseTo(2);
  expect(scene.children.length).toBe(12);
  smoke.update(20, camera);
  expect(smoke.clouds.size).toBe(0);
  expect(scene.children.length).toBe(0);
  expect(smoke.obscures(new THREE.Vector3(271, 1.12, 0), new THREE.Vector3(281, 1.12, 0))).toBe(false);
});
