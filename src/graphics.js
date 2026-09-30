import * as THREE from 'three';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

// Budget physical pixels, not CSS pixels. In particular, a 4K/retina display
// must not quietly allocate a second DPR multiplier in every postprocess pass.
export function renderPixelRatio(quality, width, height, dpr = 1) {
  return Math.min(dpr || 1, quality.pixelRatio, Math.sqrt(quality.maxPixels / Math.max(1, width * height)));
}

// A small, original reflection stage: long ceiling fixtures and cool window
// bands read as an office in brushed metal, glass and weapon highlights.
// Baked once at startup; no runtime cubemap captures or external HDR downloads.
export function createOfficeEnvironment(renderer) {
  const stage = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const finishes = [];
  function box(color, intensity, x, y, z, w, h, d) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    material.color.multiplyScalar(intensity);
    finishes.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    stage.add(mesh);
  }
  box(0xc5c5b8, 0.22, 0, 0, 0, 28, 8, 22);
  box(0x625b48, 0.14, 0, -3.9, 0, 28, 0.1, 22);
  for (const z of [-10.9, 10.9]) box(0xb6d9ed, 1.25, 0, 0.7, z, 25, 2.3, 0.05);
  for (const x of [-8, 0, 8]) for (const z of [-6, 0, 6]) box(0xfff0cf, 3.2, x, 3.85, z, 3, 0.05, 0.7);
  const generator = new THREE.PMREMGenerator(renderer);
  try {
    return generator.fromScene(stage, 0.035, 0.1, 80);
  } finally {
    geometry.dispose();
    finishes.forEach(material => material.dispose());
    generator.dispose();
  }
}

// Only the world receives AO: the viewmodel and HUD are composed afterwards.
// Half-resolution High and bounded Ultra avoid paying full 4K SSAO cost.
export class OfficeAOPass extends SSAOPass {
  constructor(scene, camera, quality) {
    super(scene, camera, 1, 1, quality.aoSamples);
    this.resolutionScale = quality.aoScale;
    this.maxDimension = 1600;
    this.kernelRadius = 0.65; // metres: contact detail, not a dark room-sized halo
    this.minDistance = 0.008 / (camera.far - camera.near);
    this.maxDistance = 1.1 / (camera.far - camera.near);
    // Keep corners legible rather than crushing the office's existing lighting.
    this.ssaoMaterial.fragmentShader = this.ssaoMaterial.fragmentShader.replace(
      'vec3( 1.0 - occlusion )', 'vec3( 1.0 - occlusion * 0.65 )'
    );
  }

  setSize(width, height) {
    const scale = Math.min(this.resolutionScale || 0.5, (this.maxDimension || 1600) / Math.max(width, height));
    super.setSize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  }

  overrideVisibility() {
    // Glass, baked shadow decals and grenade smoke must never turn into opaque
    // silhouettes in the normal/depth pass. Preserve hidden players as hidden.
    this.scene.traverse(object => {
      this._visibilityCache.set(object, object.visible);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (object.isPoints || object.isLine || object.isSprite || materials.some(material => material?.transparent)) object.visible = false;
    });
  }

  render(renderer, writeBuffer, readBuffer, ...args) {
    // FOV also changes when scoping, not just on window resize.
    this.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
    this.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
    // The world pass already updated dynamic shadows. Don't draw them twice.
    const autoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    try {
      super.render(renderer, writeBuffer, readBuffer, ...args);
    } finally {
      renderer.shadowMap.autoUpdate = autoUpdate;
      if (this._visibilityCache.size) this.restoreVisibility();
      this.scene.overrideMaterial = null;
    }
  }

  dispose() {
    super.dispose();
    // Three r160's SSAOPass does not release these two resources itself.
    this.ssaoMaterial.dispose();
    this.noiseTexture.dispose();
  }
}
