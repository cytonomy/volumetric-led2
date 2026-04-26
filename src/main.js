// volumetric-led2 entry point.
import * as THREE from 'three';
import { buildNeuron } from './neuron.js';
import { buildLEDMesh } from './leds.js';
import { Simulation, PHASES, LOOP_DURATION } from './simulation.js';
import { AudioReactive } from './audio.js';
import { Director } from './camera.js';
import { buildComposer } from './postprocess.js';
import { Hud } from './hud.js';

const LED_PRESET = {
  // Tuned for ~150k total LEDs — comfortable 60fps target on Apple Silicon
  somaLEDs:      9000,
  dendriteMain:  5000,
  dendriteBranch: 1800,
  hillockLEDs:   2200,
  axonInter:     65000,
  axonNodes:     9000,
  terminalLEDs:  4500,
  cleftLEDs:     4000,
  postsynSoma:   7000,
  postsynDend:   5000,
};

async function main() {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000004, 1.0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000004);

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 800);
  camera.position.set(-15, 10, 50);
  camera.lookAt(20, 0, 0);

  // ---- Build neuron geometry ----
  console.time('build neuron');
  const neuron = buildNeuron(LED_PRESET);
  console.timeEnd('build neuron');
  console.log(`LED count: ${neuron.count.toLocaleString()}`);

  // ---- LED instanced mesh ----
  const { mesh, uniforms } = buildLEDMesh(neuron);
  scene.add(mesh);

  // Ambient subtle fog particles for depth (very few, just for atmosphere)
  // skipped for perf

  // ---- Subsystems ----
  const sim = new Simulation(uniforms);
  const audio = new AudioReactive();
  const director = new Director(camera, sim);
  const hud = new Hud();
  const post = buildComposer(renderer, scene, camera);

  // ---- Resize ----
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    post.setSize(w, h);
  }
  window.addEventListener('resize', onResize);

  // ---- Input ----
  window.addEventListener('keydown', async (e) => {
    if (e.repeat) return;
    switch (e.key.toLowerCase()) {
      case 'f':
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        else await document.exitFullscreen();
        break;
      case 'm': await audio.toggle(); break;
      case 'h': hud.toggle(); break;
      case ' ': sim.togglePause(); e.preventDefault(); break;
      case 'r': sim.reset(); break;
      case 'a': director.toggleAuto(); break;
      case 'arrowleft': sim.scrub(-1); break;
      case 'arrowright': sim.scrub(1); break;
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
        sim.jumpToPhase(parseInt(e.key) - 1); break;
    }
  });

  // First-click also tries to enable mic (autoplay policy compliance)
  let firstClick = false;
  window.addEventListener('click', async () => {
    if (firstClick) return;
    firstClick = true;
    if (!audio.enabled) await audio.enable();
  }, { once: false });

  // ---- Loop ----
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    audio.step(dt);
    sim.step(dt, audio);
    director.step(dt);

    post.composer.render();

    hud.update(sim, audio, neuron.count);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="color:#f88;padding:20px;font:12px monospace;">${err.stack || err}</pre>`;
});
