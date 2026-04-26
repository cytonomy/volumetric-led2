// Multi-scale camera director. Each storyboard phase has a target anchor:
// position, lookAt, fov. Camera lerps toward the current target; user
// drag/scroll temporarily disengages the auto-cam.
import * as THREE from 'three';

const ANCHORS = {
  wide:      { pos: [-15,  10, 50], look: [30,  0,  0], fov: 38 },
  dendrites: { pos: [-22,  6,  18], look: [-3,  2,  0], fov: 30 },
  hillock:   { pos: [  6,  4,  12], look: [ 4,  0,  0], fov: 22 },
  axon:      { pos: [ 30,  8,  20], look: [34,  0,  0], fov: 35 },
  axonRun:   { pos: [ 18,  3,  10], look: [50,  0,  0], fov: 50 },
  terminal:  { pos: [ 60,  4,  10], look: [65,  0,  0], fov: 25 },
  postsyn:   { pos: [ 70,  3,   9], look: [70,  0,  0], fov: 28 },
  full:      { pos: [-30, 20, 70], look: [35,  0,  0], fov: 40 },
};

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export class Director {
  constructor(camera, simulation) {
    this.camera = camera;
    this.sim = simulation;
    this.auto = true;
    this.targetPos = new THREE.Vector3();
    this.targetLook = new THREE.Vector3();
    this.targetFov = 40;
    this.currentLook = new THREE.Vector3(20, 0, 0);

    this.userOrbit = { theta: 0, phi: 0, radius: 60, target: new THREE.Vector3(20, 0, 0) };
    this._setFromAnchor(ANCHORS.wide);
    camera.position.copy(this.targetPos);
    camera.lookAt(this.targetLook);
    this.currentLook.copy(this.targetLook);

    this._mouseDown = false;
    this._lastX = 0; this._lastY = 0;
    this._installInput(camera.domElement || document);
    this._lastUserT = -1e9;
  }

  toggleAuto() { this.auto = !this.auto; this._lastUserT = -1e9; }

  _setFromAnchor(a) {
    this.targetPos.set(...a.pos);
    this.targetLook.set(...a.look);
    this.targetFov = a.fov;
  }

  _anchorForPhase() {
    const { phase, progress } = this.sim.currentPhase();
    // mid-saltatory: pan the camera along the axon
    if (phase.id === 5) {
      const start = ANCHORS.hillock;
      const mid = ANCHORS.axonRun;
      const end = ANCHORS.terminal;
      const a = progress < 0.5
        ? lerpAnchor(start, mid, progress * 2)
        : lerpAnchor(mid, end, (progress - 0.5) * 2);
      return a;
    }
    // late postsyn: pull back to wide
    if (phase.id === 7 && progress > 0.6) {
      return lerpAnchor(ANCHORS.postsyn, ANCHORS.full, (progress - 0.6) / 0.4);
    }
    return ANCHORS[phase.cam] || ANCHORS.wide;
  }

  step(dt) {
    const userActive = (performance.now() - this._lastUserT) < 1500;

    if (this.auto && !userActive) {
      const a = this._anchorForPhase();
      // smooth lerp
      this.targetPos.lerp(v3(a.pos), Math.min(1, dt * 1.5));
      this.targetLook.lerp(v3(a.look), Math.min(1, dt * 1.5));
      this.targetFov = THREE.MathUtils.lerp(this.targetFov, a.fov, Math.min(1, dt * 1.5));
      this.camera.position.copy(this.targetPos);
      this.currentLook.lerp(this.targetLook, Math.min(1, dt * 2.5));
      this.camera.lookAt(this.currentLook);
      this.camera.fov = this.targetFov;
      this.camera.updateProjectionMatrix();
    } else {
      // user-orbit mode
      this._applyOrbit();
    }
  }

  _applyOrbit() {
    const o = this.userOrbit;
    const x = o.target.x + o.radius * Math.cos(o.phi) * Math.cos(o.theta);
    const z = o.target.z + o.radius * Math.cos(o.phi) * Math.sin(o.theta);
    const y = o.target.y + o.radius * Math.sin(o.phi);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(o.target);
  }

  _installInput(el) {
    const dom = el === document ? window : el;
    const onDown = (e) => { this._mouseDown = true; this._lastX = e.clientX; this._lastY = e.clientY; this._lastUserT = performance.now(); };
    const onUp = () => { this._mouseDown = false; };
    const onMove = (e) => {
      if (!this._mouseDown) return;
      const dx = e.clientX - this._lastX;
      const dy = e.clientY - this._lastY;
      this._lastX = e.clientX; this._lastY = e.clientY;
      // entering manual mode: seed orbit from current camera
      if (this.auto && (performance.now() - this._lastUserT) > 1500) {
        const o = this.userOrbit;
        const c = this.camera.position.clone().sub(o.target);
        o.radius = c.length();
        o.theta = Math.atan2(c.z, c.x);
        o.phi = Math.asin(THREE.MathUtils.clamp(c.y / o.radius, -1, 1));
      }
      this.userOrbit.theta -= dx * 0.005;
      this.userOrbit.phi = THREE.MathUtils.clamp(this.userOrbit.phi + dy * 0.005, -1.3, 1.3);
      this._lastUserT = performance.now();
    };
    const onWheel = (e) => {
      this.userOrbit.radius = THREE.MathUtils.clamp(this.userOrbit.radius * (1 + e.deltaY * 0.001), 5, 250);
      this._lastUserT = performance.now();
      e.preventDefault();
    };
    dom.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    dom.addEventListener('wheel', onWheel, { passive: false });
  }
}

function lerpAnchor(a, b, t) {
  return {
    pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * t, a.pos[1] + (b.pos[1] - a.pos[1]) * t, a.pos[2] + (b.pos[2] - a.pos[2]) * t],
    look: [a.look[0] + (b.look[0] - a.look[0]) * t, a.look[1] + (b.look[1] - a.look[1]) * t, a.look[2] + (b.look[2] - a.look[2]) * t],
    fov: a.fov + (b.fov - a.fov) * t,
  };
}
