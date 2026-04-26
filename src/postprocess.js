// HDR pipeline: render → bloom → SMAA → ACES tonemap → present.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export function buildComposer(renderer, scene, camera) {
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;

  const renderTarget = new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    samples: 0,  // no MSAA — bloom/SMAA handle AA
  });
  const composer = new EffectComposer(renderer, renderTarget);

  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Bloom: half-res for perf; threshold high so only firing LEDs bloom.
  // strength=0.5, radius=0.45, threshold=0.95 — only HDR-overflowing pixels bloom.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.45, 0.95);
  bloom.resolution.set(w / 2, h / 2);
  composer.addPass(bloom);

  const smaa = new SMAAPass(w, h);
  composer.addPass(smaa);

  const output = new OutputPass();
  composer.addPass(output);

  function setSize(w, h) {
    composer.setSize(w, h);
    bloom.setSize(w / 2, h / 2);
    smaa.setSize(w, h);
  }

  return { composer, bloom, smaa, setSize };
}
