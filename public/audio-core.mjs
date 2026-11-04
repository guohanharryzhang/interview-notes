export class PCMResampler {
  constructor(inputRate, outputRate = 24000) { this.ratio = inputRate / outputRate; this.remaining = this.ratio; this.sum = 0; }
  push(input) {
    const out = [];
    for (const raw of input) {
      const sample = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      let left = 1;
      while (left > 1e-8) {
        const take = Math.min(left, this.remaining); this.sum += sample * take; this.remaining -= take; left -= take;
        if (this.remaining < 1e-8) { const v = this.sum / this.ratio; out.push(Math.round(v * (v < 0 ? 32768 : 32767))); this.remaining = this.ratio; this.sum = 0; }
      }
    }
    return Int16Array.from(out);
  }
}
export class SpeechGate {
  constructor({ threshold = .012, silenceMs = 750, minSpeechMs = 180, maxMs = 25000 } = {}) { Object.assign(this, { threshold, silenceMs, minSpeechMs, maxMs }); this.reset(); }
  reset() { this.speech = 0; this.silence = 0; this.elapsed = 0; this.forced = false; }
  tick(rms, ms) {
    this.elapsed += ms;
    if (rms >= this.threshold) { this.speech += ms; this.silence = 0; } else this.silence += ms;
    if (this.speech >= this.minSpeechMs && (this.silence >= this.silenceMs || this.elapsed >= this.maxMs)) { const forced = this.elapsed >= this.maxMs && this.silence < this.silenceMs; this.reset(); this.forced = forced; return true; }
    if (this.silence >= this.silenceMs && this.speech < this.minSpeechMs) this.reset();
    return false;
  }
}
