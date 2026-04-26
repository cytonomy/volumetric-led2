// Procedural neuron geometry — generates LED positions + per-LED metadata
// for soma, dendrites, hillock, axon (with nodes of Ranvier), terminal,
// synaptic cleft, and post-synaptic dendrite.
//
// Each LED is a (position, structureType, pathParam, structureId) tuple.
// pathParam is the normalized [0..1] position along the parent structure
// (used by the shader to compute traveling-wave intensity).
import * as THREE from 'three';

export const STRUCT = {
  SOMA: 0,
  DENDRITE: 1,
  HILLOCK: 2,
  AXON_INTER: 3,
  AXON_NODE: 4,
  TERMINAL: 5,
  CLEFT: 6,
  POSTSYN_DEND: 7,
  POSTSYN_SOMA: 8,
};

// World axis: neuron extends along +X. Soma at origin, terminal far +X.
const AXON_LEN = 60;
const NODE_COUNT = 10;
const NODE_POSITIONS = Array.from({ length: NODE_COUNT }, (_, i) => (i + 0.5) / NODE_COUNT);

function randUnitSphere() {
  // uniform on sphere
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return [r * Math.cos(t), r * Math.sin(t), u];
}

function pushLED(arrays, p, structure, pathParam, structureId) {
  arrays.pos.push(p[0], p[1], p[2]);
  arrays.struct.push(structure);
  arrays.path.push(pathParam);
  arrays.id.push(structureId);
}

// Soma — fuzzy sphere shell with some interior fill
function buildSoma(arrays, count) {
  const R = 2.5;
  for (let i = 0; i < count; i++) {
    const [x, y, z] = randUnitSphere();
    // bias toward shell with a thin layer of interior
    const r = R * (0.85 + Math.random() * 0.15);
    pushLED(arrays, [x * r, y * r, z * r], STRUCT.SOMA, 0, 0);
  }
}

// Catmull-Rom path sampler with radial jitter for "tube" appearance
function tubeSamples(curve, count, radiusFn, structure, structureId, arrays) {
  for (let i = 0; i < count; i++) {
    const t = Math.random();
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t).normalize();
    // build a frame perpendicular to tangent
    let up = new THREE.Vector3(0, 1, 0);
    if (Math.abs(tangent.dot(up)) > 0.9) up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const fwd = new THREE.Vector3().crossVectors(right, tangent).normalize();
    const theta = Math.random() * Math.PI * 2;
    const r = radiusFn(t) * Math.sqrt(Math.random());
    const offset = right.clone().multiplyScalar(Math.cos(theta) * r)
      .add(fwd.clone().multiplyScalar(Math.sin(theta) * r));
    pushLED(arrays, [p.x + offset.x, p.y + offset.y, p.z + offset.z],
      structure, t, structureId);
  }
}

// Dendrites: 5 main, each with 1 sub-branch.
function buildDendrites(arrays, mainCount, branchCount) {
  const branches = 5;
  for (let b = 0; b < branches; b++) {
    const angle = (b / branches) * Math.PI * 2 + 0.3;
    const elev = (Math.random() - 0.5) * 0.6;
    // main dendrite curls outward in -X half-space
    const dir = new THREE.Vector3(
      -Math.cos(angle) * 0.6 - 0.5,
      Math.sin(angle) * Math.cos(elev),
      Math.sin(angle) * Math.sin(elev) * 0.7
    ).normalize();
    const start = dir.clone().multiplyScalar(2.3);
    const mid = dir.clone().multiplyScalar(8).add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2));
    const end = dir.clone().multiplyScalar(15).add(new THREE.Vector3((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 4));
    const curve = new THREE.CatmullRomCurve3([start, mid, end]);
    tubeSamples(curve, mainCount, t => 0.6 - t * 0.45, STRUCT.DENDRITE, b, arrays);

    // sub-branch from mid
    const subDir = mid.clone().sub(start).normalize();
    const perp = new THREE.Vector3().crossVectors(subDir, new THREE.Vector3(0, 1, 0)).normalize();
    const subEnd = mid.clone()
      .add(subDir.multiplyScalar(4))
      .add(perp.multiplyScalar((Math.random() - 0.5) * 6))
      .add(new THREE.Vector3(0, (Math.random() - 0.5) * 4, 0));
    const subCurve = new THREE.CatmullRomCurve3([
      mid,
      mid.clone().lerp(subEnd, 0.5).add(new THREE.Vector3(0, (Math.random() - 0.5) * 2, 0)),
      subEnd
    ]);
    tubeSamples(subCurve, branchCount, t => 0.35 - t * 0.25, STRUCT.DENDRITE, b + branches, arrays);
  }
}

// Axon hillock — cone emerging from soma at +X
function buildHillock(arrays, count) {
  const start = new THREE.Vector3(2.0, 0, 0);
  const end = new THREE.Vector3(4.5, 0, 0);
  const curve = new THREE.CatmullRomCurve3([start, new THREE.Vector3(3.2, 0, 0), end]);
  tubeSamples(curve, count, t => 1.4 - t * 0.6, STRUCT.HILLOCK, 0, arrays);
}

// Axon — long gentle curve along +X with periodic NODE clusters
function buildAxon(arrays, internodeCount, nodeBoostCount) {
  const start = new THREE.Vector3(4.5, 0, 0);
  const ctrl1 = new THREE.Vector3(20, 4, -2);
  const ctrl2 = new THREE.Vector3(40, -3, 3);
  const end = new THREE.Vector3(4.5 + AXON_LEN, 0, 0);
  const curve = new THREE.CatmullRomCurve3([start, ctrl1, ctrl2, end]);

  // Internode LEDs (dim, myelin)
  tubeSamples(curve, internodeCount, t => 0.7, STRUCT.AXON_INTER, 0, arrays);

  // Node clusters (bright at firing time)
  const radii = [];
  for (let i = 0; i < internodeCount; i++) radii.push(0);
  for (let n = 0; n < NODE_COUNT; n++) {
    const tNode = NODE_POSITIONS[n];
    const perNode = nodeBoostCount / NODE_COUNT;
    for (let i = 0; i < perNode; i++) {
      // sample within ±0.012 of node param
      const t = Math.max(0, Math.min(1, tNode + (Math.random() - 0.5) * 0.024));
      const p = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();
      let up = new THREE.Vector3(0, 1, 0);
      if (Math.abs(tangent.dot(up)) > 0.9) up = new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const fwd = new THREE.Vector3().crossVectors(right, tangent).normalize();
      const theta = Math.random() * Math.PI * 2;
      const r = 1.0 * Math.sqrt(Math.random());
      const offset = right.clone().multiplyScalar(Math.cos(theta) * r)
        .add(fwd.clone().multiplyScalar(Math.sin(theta) * r));
      pushLED(arrays, [p.x + offset.x, p.y + offset.y, p.z + offset.z],
        STRUCT.AXON_NODE, t, n);
    }
  }
}

// Terminal bouton — small sphere at end of axon, with active zone facing +X
function buildTerminal(arrays, count) {
  const center = new THREE.Vector3(4.5 + AXON_LEN, 0, 0);
  const R = 2.0;
  for (let i = 0; i < count; i++) {
    const [x, y, z] = randUnitSphere();
    const r = R * (0.7 + Math.random() * 0.3);
    pushLED(arrays, [center.x + x * r, center.y + y * r, center.z + z * r],
      STRUCT.TERMINAL, 0, 0);
  }
}

// Synaptic cleft — thin slab in YZ plane just past terminal
function buildCleft(arrays, count) {
  const x0 = 4.5 + AXON_LEN + 2.2;
  const w = 0.9; // cleft width along X
  const R = 2.5; // radial extent in YZ
  for (let i = 0; i < count; i++) {
    const x = x0 + Math.random() * w;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * R;
    const y = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    // pathParam = position across cleft (0 = pre, 1 = post)
    const pathParam = (x - x0) / w;
    pushLED(arrays, [x, y, z], STRUCT.CLEFT, pathParam, 0);
  }
}

// Post-synaptic neuron (partial) — soma + a few dendrite spines facing the cleft
function buildPostsyn(arrays, somaCount, dendCount) {
  const center = new THREE.Vector3(4.5 + AXON_LEN + 6.5, 0, 0);
  const R = 2.0;
  for (let i = 0; i < somaCount; i++) {
    const [x, y, z] = randUnitSphere();
    const r = R * (0.85 + Math.random() * 0.15);
    pushLED(arrays, [center.x + x * r, center.y + y * r, center.z + z * r],
      STRUCT.POSTSYN_SOMA, 0, 0);
  }
  // Three dendrite stubs facing -X (toward cleft)
  const stubs = 3;
  for (let s = 0; s < stubs; s++) {
    const angle = (s / stubs) * Math.PI * 2 + 0.5;
    const dir = new THREE.Vector3(-1, Math.cos(angle) * 0.4, Math.sin(angle) * 0.4).normalize();
    const start = center.clone().add(dir.clone().multiplyScalar(1.9));
    const end = center.clone().add(dir.multiplyScalar(5.5));
    const curve = new THREE.CatmullRomCurve3([
      start,
      start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5)),
      end
    ]);
    tubeSamples(curve, Math.floor(dendCount / stubs), t => 0.45 - t * 0.2, STRUCT.POSTSYN_DEND, s, arrays);
  }
}

export function buildNeuron({
  somaLEDs = 8000,
  dendriteMain = 4500,
  dendriteBranch = 1500,
  hillockLEDs = 2000,
  axonInter = 60000,
  axonNodes = 8000,
  terminalLEDs = 4000,
  cleftLEDs = 3500,
  postsynSoma = 6000,
  postsynDend = 4500,
} = {}) {
  const arrays = { pos: [], struct: [], path: [], id: [] };

  buildSoma(arrays, somaLEDs);
  buildDendrites(arrays, dendriteMain, dendriteBranch);
  buildHillock(arrays, hillockLEDs);
  buildAxon(arrays, axonInter, axonNodes);
  buildTerminal(arrays, terminalLEDs);
  buildCleft(arrays, cleftLEDs);
  buildPostsyn(arrays, postsynSoma, postsynDend);

  const total = arrays.struct.length;

  return {
    count: total,
    positions: new Float32Array(arrays.pos),
    structures: new Float32Array(arrays.struct),
    paths: new Float32Array(arrays.path),
    ids: new Float32Array(arrays.id),
    nodePositions: NODE_POSITIONS,
    axonLength: AXON_LEN,
    axonStartX: 4.5,
    axonEndX: 4.5 + AXON_LEN,
    cleftStartX: 4.5 + AXON_LEN + 2.2,
    postsynCenterX: 4.5 + AXON_LEN + 6.5,
  };
}
