// Phase scheduler — drives the storyboard.
// Computes (phaseId, phaseProgress, time) each frame and posts to LED uniforms.
// Also fires "ion flare" events at phase boundaries.
import * as THREE from 'three';

export const PHASES = [
  { id: 0, name: 'rest',      duration: 4.0,  cam: 'wide'      },
  { id: 1, name: 'dendritic', duration: 4.0,  cam: 'dendrites' },
  { id: 2, name: 'hillock',   duration: 1.5,  cam: 'hillock'   },
  { id: 3, name: 'AP init',   duration: 1.0,  cam: 'hillock'   },
  { id: 4, name: 'repol',     duration: 1.5,  cam: 'hillock'   },
  { id: 5, name: 'saltatory', duration: 8.0,  cam: 'axon'      },
  { id: 6, name: 'terminal',  duration: 4.0,  cam: 'terminal'  },
  { id: 7, name: 'postsyn',   duration: 4.0,  cam: 'postsyn'   },
];

export const LOOP_DURATION = PHASES.reduce((s, p) => s + p.duration, 0);

// ion-flare events at phase transitions: { atTime, color, duration }
const FLARE_EVENTS = (() => {
  const e = [];
  let t = 0;
  for (const p of PHASES) {
    if (p.id === 3) e.push({ at: t + 0.1, color: [0.3, 0.7, 1.4], dur: 0.4 });        // Na+ blue at AP
    if (p.id === 4) e.push({ at: t + 0.05, color: [0.2, 1.4, 0.5], dur: 0.4 });       // K+ green
    if (p.id === 6) e.push({ at: t + 0.3, color: [1.0, 0.3, 1.4], dur: 0.5 });        // Ca++ purple
    if (p.id === 6) e.push({ at: t + 1.5, color: [1.5, 1.1, 0.2], dur: 0.6 });        // NT yellow
    t += p.duration;
  }
  return e;
})();

export class Simulation {
  constructor(uniforms) {
    this.uniforms = uniforms;
    this.t = 0;             // wall time within loop, [0, LOOP_DURATION)
    this.paused = false;
    this.speed = 1.0;
    this.flareColor = new THREE.Vector3();
  }

  reset() { this.t = 0; }
  togglePause() { this.paused = !this.paused; }
  scrub(dt) { this.t = (this.t + dt + LOOP_DURATION) % LOOP_DURATION; }
  jumpToPhase(idx) {
    let acc = 0;
    for (let i = 0; i < PHASES.length; i++) {
      if (i === idx) { this.t = acc; return; }
      acc += PHASES[i].duration;
    }
  }

  currentPhase() {
    let acc = 0;
    for (const p of PHASES) {
      if (this.t < acc + p.duration) {
        return { phase: p, start: acc, progress: (this.t - acc) / p.duration };
      }
      acc += p.duration;
    }
    const last = PHASES[PHASES.length - 1];
    return { phase: last, start: LOOP_DURATION - last.duration, progress: 1 };
  }

  step(dt, audio) {
    if (!this.paused) this.t = (this.t + dt * this.speed) % LOOP_DURATION;

    const { phase, progress } = this.currentPhase();
    this.uniforms.uTime.value = this.t;
    this.uniforms.uPhase.value = phase.id;
    this.uniforms.uPhaseT.value = progress;
    this.uniforms.uAudio.value.set(
      audio.bass, audio.mid, audio.treble, audio.beat
    );

    // master gain has subtle phase-dependent boost during AP peaks
    let gain = 1.0;
    if (phase.id === 3) gain = 1.0 + 0.3 * Math.sin(progress * Math.PI);
    if (phase.id === 5) gain = 1.0 + 0.15 * (1 + Math.sin(this.t * 6.0));
    this.uniforms.uMasterGain.value = gain * (0.85 + 0.3 * audio.bass);

    // Process ion flares
    let activeFlare = null;
    for (const f of FLARE_EVENTS) {
      const dt = this.t - f.at;
      if (dt >= 0 && dt <= f.dur) {
        const env = Math.exp(-(dt / f.dur) * 3) * (1 - dt / f.dur);
        if (!activeFlare || env > activeFlare.amt) {
          activeFlare = { color: f.color, amt: env };
        }
      }
    }
    if (activeFlare) {
      this.flareColor.fromArray(activeFlare.color);
      this.uniforms.uIonFlare.value.copy(this.flareColor);
      this.uniforms.uIonFlareAmt.value = activeFlare.amt;
    } else {
      this.uniforms.uIonFlareAmt.value = 0;
    }
  }
}
