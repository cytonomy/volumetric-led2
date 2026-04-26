// Phase-driven LED shading.
// Computes a per-LED (color, intensity) from:
//   - the storyboard phase + sub-progress (uniforms)
//   - the LED's structure type + position along its parent path
//   - audio bands (bass / mid / treble / beat)
// Then renders a soft sphere via UV falloff.

precision highp float;

varying vec2 vUv;
varying float vStructure;
varying float vPathParam;
varying float vStructureId;
varying vec3 vWorldPos;

uniform float uTime;        // seconds, loops with phase scheduler
uniform float uPhase;       // 0..7 current phase index (continuous: 1.5 = mid-transition)
uniform float uPhaseT;      // 0..1 progress within current phase
uniform vec4 uAudio;        // bass, mid, treble, beatPulse(0..1)
uniform float uMasterGain;
uniform vec3 uIonFlare;     // current dominant ion flare color (transient)
uniform float uIonFlareAmt; // strength of the ion flare event
uniform float uAxonStartX;
uniform float uAxonEndX;
uniform float uHillockX;
uniform float uTerminalX;
uniform float uCleftStartX;

// Structure type IDs (must match neuron.js STRUCT)
const float ST_SOMA = 0.0;
const float ST_DENDRITE = 1.0;
const float ST_HILLOCK = 2.0;
const float ST_AXON_INTER = 3.0;
const float ST_AXON_NODE = 4.0;
const float ST_TERMINAL = 5.0;
const float ST_CLEFT = 6.0;
const float ST_POSTSYN_DEND = 7.0;
const float ST_POSTSYN_SOMA = 8.0;

// Phase IDs
// 0 rest, 1 dendritic EPSPs, 2 hillock summation, 3 AP init, 4 repol,
// 5 saltatory, 6 terminal Ca + vesicle, 7 postsyn EPSP

// Voltage palette: cyan (rest -70mV) -> green-yellow (threshold) -> orange (depol)
// -> white (peak) -> indigo (hyperpol).
vec3 voltageColor(float v) {
  // v in [-1..+1.5]; -1 = hyperpol, 0 = rest, 0.5 = threshold, 1 = depol, 1.5 = peak
  vec3 hyper  = vec3(0.20, 0.10, 0.55);  // indigo
  vec3 rest   = vec3(0.00, 0.65, 1.00);  // cyan
  vec3 thresh = vec3(0.30, 0.95, 0.80);  // teal-green
  vec3 depol  = vec3(1.00, 0.55, 0.10);  // orange
  vec3 peak   = vec3(1.30, 1.20, 1.10);  // white-hot HDR
  vec3 c;
  if (v < 0.0)      c = mix(hyper, rest, smoothstep(-1.0, 0.0, v));
  else if (v < 0.5) c = mix(rest, thresh, smoothstep(0.0, 0.5, v));
  else if (v < 1.0) c = mix(thresh, depol, smoothstep(0.5, 1.0, v));
  else              c = mix(depol, peak, smoothstep(1.0, 1.5, v));
  return c;
}

// Smooth pulse function (Gaussian-like) centered at c, width w
float pulse(float x, float c, float w) {
  float d = (x - c) / w;
  return exp(-d * d);
}

// hash for stochastic effects
float hash11(float p) { return fract(sin(p * 78.233) * 43758.5453); }

void main() {
  // Soft sphere shading from UV
  float r2 = dot(vUv, vUv);
  if (r2 > 1.0) discard;
  // pseudo-normal (z = sqrt(1 - r2))
  float z = sqrt(1.0 - r2);
  // emissive core: bright near center
  float core = pow(1.0 - r2, 2.0);
  // edge falloff
  float falloff = smoothstep(1.0, 0.0, sqrt(r2));

  // ---- per-structure baseline state ----
  float voltage = 0.0;        // -1..+1.5
  float intensity = 0.05;      // base brightness
  vec3 flare = vec3(0.0);     // ion-flare additive color
  float flareAmt = 0.0;

  float phase = uPhase;
  float pt = uPhaseT;

  // Phase 0: rest --------------------------------------------------------
  if (phase < 1.0) {
    voltage = -0.05 + 0.03 * sin(uTime * 0.7 + vStructureId * 1.3);
    intensity = 0.10 + 0.04 * uAudio.x; // bass-driven pump pulse
  }

  // Phase 1: dendritic EPSPs ---------------------------------------------
  // graded depolarization on a few random dendrites, decremental as it
  // travels toward soma (pathParam=1 closest to soma, 0 = tip)
  if (phase >= 1.0 && phase < 2.0) {
    voltage = -0.05;
    intensity = 0.08;
    if (vStructure == ST_DENDRITE) {
      // pick which dendrite branches are active based on time + id
      float branchHash = hash11(vStructureId * 3.7);
      float activate = step(0.45, branchHash) * step(branchHash, 0.95);
      // wave traveling up (pathParam from 0 toward 1): we time pulses at this
      // dendrite's center param
      float waveT = pt * 1.4;
      float p = pulse(vPathParam, 1.0 - waveT, 0.25 + 0.1 * uAudio.x);
      float epsp = activate * p * (0.4 + 0.6 * branchHash);
      voltage = mix(-0.05, 0.4, epsp);
      intensity = 0.08 + 0.5 * epsp + 0.15 * uAudio.x * activate;
      // ion flare: small Na+ blue at distal sites
      flare = vec3(0.2, 0.5, 1.2);
      flareAmt = epsp * 0.3;
    }
    if (vStructure == ST_SOMA) {
      // soma starts to integrate
      voltage = -0.05 + 0.18 * pt;
      intensity = 0.10 + 0.10 * pt;
    }
  }

  // Phase 2: hillock summation -------------------------------------------
  if (phase >= 2.0 && phase < 3.0) {
    voltage = 0.10 + 0.35 * pt;
    intensity = 0.15 + 0.4 * pt;
    if (vStructure == ST_HILLOCK) {
      voltage = 0.20 + 0.6 * pt;
      intensity = 0.25 + 0.7 * pt + 0.2 * uAudio.x;
    }
    if (vStructure == ST_DENDRITE) {
      // dendrites still glow softly
      voltage = -0.02 + 0.10 * (1.0 - pt);
      intensity = 0.10;
    }
  }

  // Phase 3: AP initiation (Na+ inflow, white-hot peak) ------------------
  if (phase >= 3.0 && phase < 4.0) {
    if (vStructure == ST_HILLOCK || vStructure == ST_SOMA) {
      // peak rises fast then plateau briefly
      float peak = pulse(pt, 0.4, 0.25);
      voltage = mix(0.5, 1.5, peak);
      intensity = 0.4 + 1.5 * peak;
      flare = vec3(0.2, 0.5, 1.3);  // Na+ blue
      flareAmt = peak * 0.8;
    } else {
      voltage = 0.05;
      intensity = 0.10;
    }
  }

  // Phase 4: repolarization (K+ outflow, refractory dip) -----------------
  if (phase >= 4.0 && phase < 5.0) {
    if (vStructure == ST_HILLOCK || vStructure == ST_SOMA) {
      // voltage swings from peak -> rest -> hyperpol over phase
      voltage = mix(1.4, -0.6, smoothstep(0.0, 0.7, pt));
      voltage = mix(voltage, -0.05, smoothstep(0.7, 1.0, pt));
      intensity = 0.4 * (1.0 - pt) + 0.15;
      flare = vec3(0.1, 1.2, 0.5);  // K+ green
      flareAmt = pulse(pt, 0.3, 0.2) * 0.6;
    } else {
      voltage = 0.0;
      intensity = 0.10;
    }
  }

  // Phase 5: saltatory conduction ----------------------------------------
  // AP wave travels along axon from start (pathParam=0) to end (=1).
  // wavePos = pt at this phase (with audio nudge).
  if (phase >= 5.0 && phase < 6.0) {
    float wavePos = pt + 0.05 * uAudio.x;
    if (vStructure == ST_AXON_INTER) {
      // myelin: dim, with subtle "ringing" wake
      float dist = vPathParam - wavePos;
      voltage = -0.05 + 0.3 * exp(-abs(dist) * 18.0);
      intensity = 0.05 + 0.6 * exp(-pow(dist * 12.0, 2.0));
    }
    if (vStructure == ST_AXON_NODE) {
      // nodes flash brightly when wave is near (jumpy)
      float nodeT = (float(int(vStructureId * 0.0001 + vStructureId)) + 0.5) / 10.0;
      // approximate node center param via stored id position (we encoded id 0..9)
      nodeT = (vStructureId + 0.5) / 10.0;
      float arrive = pulse(wavePos, nodeT, 0.045);
      voltage = mix(-0.1, 1.5, arrive);
      intensity = 0.1 + 2.0 * arrive;
      flare = mix(vec3(0.2, 0.5, 1.3), vec3(0.1, 1.2, 0.5), smoothstep(0.0, 0.5, fract(arrive)));
      flareAmt = arrive * 0.7;
    }
    if (vStructure == ST_HILLOCK || vStructure == ST_SOMA) {
      voltage = -0.2 + 0.15 * (1.0 - pt);
      intensity = 0.08;
    }
    if (vStructure == ST_DENDRITE) {
      voltage = -0.05;
      intensity = 0.08;
    }
  }

  // Phase 6: terminal Ca + vesicle release -------------------------------
  if (phase >= 6.0 && phase < 7.0) {
    if (vStructure == ST_TERMINAL) {
      // active zone: side facing +X (positive x relative to terminal center)
      float az = smoothstep(0.0, 1.0, (vWorldPos.x - uTerminalX) / 1.5);
      float caBurst = pulse(pt, 0.25, 0.15);
      float vesicle = pulse(pt, 0.55, 0.2);
      voltage = mix(0.0, 1.0, max(caBurst, vesicle));
      intensity = 0.2 + (1.6 * caBurst + 1.2 * vesicle) * az + 0.2;
      flare = mix(vec3(0.7, 0.2, 1.4), vec3(1.4, 1.0, 0.2), step(0.5, pt));  // Ca purple -> NT yellow
      flareAmt = (caBurst + vesicle * 0.7) * az;
    }
    if (vStructure == ST_CLEFT) {
      // NT diffusion across cleft
      float wave = smoothstep(0.4, 1.0, pt);
      float ntDensity = wave * (1.0 - vPathParam * 0.5) * (0.6 + 0.4 * hash11(vStructureId + floor(uTime * 4.0)));
      voltage = 0.5;
      intensity = 0.15 + ntDensity * 1.4;
      flare = vec3(1.4, 1.0, 0.2);  // NT yellow
      flareAmt = ntDensity * 0.5;
    }
    if (vStructure == ST_AXON_INTER || vStructure == ST_AXON_NODE) {
      voltage = -0.1;
      intensity = 0.04;
    }
  }

  // Phase 7: post-synaptic EPSP ------------------------------------------
  if (phase >= 7.0) {
    if (vStructure == ST_POSTSYN_DEND || vStructure == ST_POSTSYN_SOMA) {
      // spine activation propagates inward
      float dist = (vWorldPos.x - uCleftStartX) / 8.0;
      float wave = smoothstep(0.0, 1.0, pt) - dist * 0.4;
      float epsp = clamp(wave, 0.0, 1.0);
      voltage = mix(-0.05, 0.7, epsp);
      intensity = 0.1 + 0.7 * epsp;
      flare = vec3(1.2, 0.6, 0.15);
      flareAmt = epsp * 0.4;
    }
    if (vStructure == ST_CLEFT) {
      // NT clearing
      voltage = 0.2;
      intensity = 0.2 * (1.0 - pt);
      flare = vec3(1.0, 0.8, 0.2);
      flareAmt = 0.2 * (1.0 - pt);
    }
    if (vStructure == ST_TERMINAL) {
      voltage = 0.0;
      intensity = 0.1;
    }
  }

  // ---- audio modulation ----
  // treble adds high-frequency twinkle to active LEDs
  float twinkle = sin(uTime * 25.0 + vStructureId * 9.7 + vPathParam * 30.0);
  twinkle = twinkle * 0.5 + 0.5;
  intensity *= (1.0 + uAudio.z * 0.4 * twinkle);

  // beat pulse boosts overall brightness briefly
  intensity *= (1.0 + uAudio.w * 0.35);

  // master gain
  intensity *= uMasterGain;

  // ---- assemble color ----
  vec3 base = voltageColor(voltage);
  vec3 col = base * intensity;
  col += flare * flareAmt * 1.3;

  // soft-sphere shading
  col *= core + falloff * 0.25;

  // Add ambient ion-flare (driven by simulation-level events)
  col += uIonFlare * uIonFlareAmt * core * 0.4;

  // HDR pass-through; tonemap is applied later
  gl_FragColor = vec4(col, falloff);
}
