// Per-instance billboard quad expansion.
// Each LED is rendered as a 2-tri quad facing the camera; the fragment
// shader paints a soft-sphere on it via UV.

attribute vec3 iPosition;
attribute float iStructure;
attribute float iPathParam;
attribute float iStructureId;

uniform float uLedRadius;
uniform float uTime;
uniform vec4 uAudio; // bass, mid, treble, beatPulse

varying vec2 vUv;
varying float vStructure;
varying float vPathParam;
varying float vStructureId;
varying vec3 vWorldPos;

void main() {
  vec4 mvCenter = modelViewMatrix * vec4(iPosition, 1.0);

  // Subtle micro-jitter on each LED: gives the grid an organic "twinkle"
  // when audio is loud. Computed per-instance, deterministic via id+structure.
  float seed = iStructureId * 12.34 + iStructure * 5.67 + iPathParam * 91.0;
  float jitter = (sin(uTime * 6.28318 * 2.0 + seed) * 0.5 + 0.5);
  float radiusBoost = 1.0 + 0.12 * uAudio.y * jitter;

  vec4 mvOffset = mvCenter + vec4(position.xy * uLedRadius * radiusBoost, 0.0, 0.0);
  gl_Position = projectionMatrix * mvOffset;

  vUv = position.xy; // unit quad covers [-1,1]
  vStructure = iStructure;
  vPathParam = iPathParam;
  vStructureId = iStructureId;
  vWorldPos = iPosition;
}
