// Web Audio mic input → FFT → bass/mid/treble buckets + beat detection.
// Gracefully degrades to silence if mic permission denied / no input.

export class AudioReactive {
  constructor() {
    this.enabled = false;
    this.bass = 0;
    this.mid = 0;
    this.treble = 0;
    this.beat = 0;          // 0..1 envelope follower of spectral flux peaks
    this._beatEnv = 0;
    this._lastSpectrum = null;
    this._ctx = null;
    this._analyser = null;
    this._stream = null;
    this._fftBuf = null;
  }

  async enable() {
    if (this.enabled) return true;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const src = this._ctx.createMediaStreamSource(this._stream);
      this._analyser = this._ctx.createAnalyser();
      this._analyser.fftSize = 1024;
      this._analyser.smoothingTimeConstant = 0.6;
      src.connect(this._analyser);
      this._fftBuf = new Uint8Array(this._analyser.frequencyBinCount);
      this.enabled = true;
      return true;
    } catch (e) {
      console.warn('Mic permission denied or unavailable:', e?.message || e);
      this.enabled = false;
      return false;
    }
  }

  disable() {
    if (!this.enabled) return;
    this._stream?.getTracks().forEach(t => t.stop());
    this._ctx?.close();
    this._stream = null;
    this._ctx = null;
    this._analyser = null;
    this.enabled = false;
    this.bass = this.mid = this.treble = this.beat = 0;
  }

  async toggle() {
    if (this.enabled) { this.disable(); return false; }
    return this.enable();
  }

  step(dt) {
    if (!this.enabled || !this._analyser) {
      // synthetic gentle motion so the visualization is alive even with no audio
      const t = performance.now() * 0.001;
      this.bass = 0.18 + 0.10 * (Math.sin(t * 0.7) * 0.5 + 0.5);
      this.mid = 0.10 + 0.06 * (Math.sin(t * 1.3 + 0.7) * 0.5 + 0.5);
      this.treble = 0.05 + 0.04 * (Math.sin(t * 2.1 + 1.3) * 0.5 + 0.5);
      this._beatEnv = Math.max(0, this._beatEnv - dt * 1.5);
      this.beat = this._beatEnv;
      return;
    }

    this._analyser.getByteFrequencyData(this._fftBuf);
    const N = this._fftBuf.length;          // typically 512
    const nyq = this._ctx.sampleRate / 2;
    const binHz = nyq / N;

    // bands (in Hz)
    const bassEnd = Math.floor(180 / binHz);
    const midEnd = Math.floor(2500 / binHz);
    const trebleEnd = Math.min(N - 1, Math.floor(8000 / binHz));

    let bSum = 0, mSum = 0, tSum = 0;
    for (let i = 1; i < bassEnd; i++) bSum += this._fftBuf[i];
    for (let i = bassEnd; i < midEnd; i++) mSum += this._fftBuf[i];
    for (let i = midEnd; i < trebleEnd; i++) tSum += this._fftBuf[i];

    const bAvg = bSum / Math.max(1, bassEnd - 1) / 255;
    const mAvg = mSum / Math.max(1, midEnd - bassEnd) / 255;
    const tAvg = tSum / Math.max(1, trebleEnd - midEnd) / 255;

    // smoothing
    this.bass   = this.bass   * 0.6 + bAvg * 0.4;
    this.mid    = this.mid    * 0.6 + mAvg * 0.4;
    this.treble = this.treble * 0.5 + tAvg * 0.5;

    // beat detection via spectral flux on bass band
    let flux = 0;
    if (this._lastSpectrum) {
      for (let i = 1; i < bassEnd; i++) {
        const d = this._fftBuf[i] - this._lastSpectrum[i];
        if (d > 0) flux += d;
      }
    } else {
      this._lastSpectrum = new Uint8Array(N);
    }
    this._lastSpectrum.set(this._fftBuf);
    flux = flux / 255 / bassEnd;

    // Peak detection: threshold + envelope follower
    const thr = 0.15;
    if (flux > thr) {
      this._beatEnv = Math.min(1, this._beatEnv + (flux - thr) * 6);
    }
    this._beatEnv = Math.max(0, this._beatEnv - dt * 2.5);
    this.beat = this._beatEnv;
  }
}
