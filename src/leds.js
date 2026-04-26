// InstancedBufferGeometry of billboard quads, one per LED.
// Uses a custom ShaderMaterial that does all phase-driven shading on the GPU.
import * as THREE from 'three';
import vertSrc from './shaders/led.vert?raw';
import fragSrc from './shaders/led.frag?raw';

export function buildLEDMesh(neuron) {
  const geometry = new THREE.InstancedBufferGeometry();

  // Base quad (-1..1) in XY, two triangles
  const quad = new Float32Array([
    -1, -1, 0,
     1, -1, 0,
     1,  1, 0,
    -1,  1, 0,
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2, 0, 2, 3]), 1));

  geometry.setAttribute('iPosition',
    new THREE.InstancedBufferAttribute(neuron.positions, 3));
  geometry.setAttribute('iStructure',
    new THREE.InstancedBufferAttribute(neuron.structures, 1));
  geometry.setAttribute('iPathParam',
    new THREE.InstancedBufferAttribute(neuron.paths, 1));
  geometry.setAttribute('iStructureId',
    new THREE.InstancedBufferAttribute(neuron.ids, 1));

  geometry.instanceCount = neuron.count;

  // Bounding sphere — needed for frustum culling not to nuke us
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3((neuron.axonStartX + neuron.postsynCenterX) / 2, 0, 0),
    (neuron.postsynCenterX - neuron.axonStartX) * 0.7 + 10
  );

  const uniforms = {
    uLedRadius:    { value: 0.065 },
    uTime:         { value: 0 },
    uPhase:        { value: 0 },
    uPhaseT:       { value: 0 },
    uAudio:        { value: new THREE.Vector4(0, 0, 0, 0) },
    uMasterGain:   { value: 1.0 },
    uIonFlare:     { value: new THREE.Vector3(0, 0, 0) },
    uIonFlareAmt:  { value: 0 },
    uAxonStartX:   { value: neuron.axonStartX },
    uAxonEndX:     { value: neuron.axonEndX },
    uHillockX:     { value: 3.5 },
    uTerminalX:    { value: neuron.axonEndX },
    uCleftStartX:  { value: neuron.cleftStartX },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: vertSrc,
    fragmentShader: fragSrc,
    uniforms,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // billboarded; bbox isn't reliable
  return { mesh, uniforms };
}
