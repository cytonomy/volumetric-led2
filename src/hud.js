// Lightweight HUD: phase label, fps, audio meter, hide/show.
export class Hud {
  constructor() {
    this.phaseEl = document.getElementById('phase');
    this.statsEl = document.getElementById('stats');
    this.titleEl = document.getElementById('title');
    this.hudEl = document.getElementById('hud');
    this.visible = true;
    this._frames = 0;
    this._lastFpsT = performance.now();
    this._fps = 0;
  }

  toggle() {
    this.visible = !this.visible;
    for (const el of [this.phaseEl, this.statsEl, this.titleEl, this.hudEl]) {
      el?.classList.toggle('hidden', !this.visible);
    }
  }

  update(sim, audio, ledCount) {
    this._frames++;
    const now = performance.now();
    if (now - this._lastFpsT > 500) {
      this._fps = (this._frames * 1000) / (now - this._lastFpsT);
      this._frames = 0;
      this._lastFpsT = now;
    }

    const { phase, progress } = sim.currentPhase();
    if (this.phaseEl) {
      this.phaseEl.textContent =
        `phase ${phase.id + 1}/8 · ${phase.name} · ${(progress * 100).toFixed(0)}%`;
    }
    if (this.statsEl) {
      const audioStr = audio.enabled
        ? `mic on · b ${audio.bass.toFixed(2)} m ${audio.mid.toFixed(2)} t ${audio.treble.toFixed(2)} ♪ ${audio.beat.toFixed(2)}`
        : `mic off · synthetic timing`;
      this.statsEl.textContent =
        `${this._fps.toFixed(0)} fps · ${(ledCount / 1000).toFixed(0)}k leds\n${audioStr}`;
    }
  }
}
