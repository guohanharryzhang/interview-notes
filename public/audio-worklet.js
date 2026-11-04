import { PCMResampler, SpeechGate } from './audio-core.mjs';
class InterviewMicrophone extends AudioWorkletProcessor {
  constructor(options) {
    super(); this.resampler = new PCMResampler(sampleRate, 24000);
    this.gate = new SpeechGate({ threshold: options.processorOptions?.threshold || .012 });
    this.chunk = new Int16Array(2400); this.index = 0; this.preRoll = []; this.active = false; this.sentMs = 0;
    this.port.onmessage = event => { if (event.data.type === 'flush' && this.active) { if (this.index) { this.send(this.chunk.slice(0,this.index)); this.index = 0; } this.port.postMessage({ type:'commit', eligible:true }); this.active = false; this.sentMs = 0; this.gate.reset(); } };
  }
  send(pcm) { this.sentMs += pcm.length / 24; this.port.postMessage({ type:'audio', buffer:pcm.buffer }, [pcm.buffer]); }
  emit(chunk) {
    let power = 0; for (const n of chunk) power += (n / 32768) ** 2; const rms = Math.sqrt(power / chunk.length);
    this.port.postMessage({ type:'level', rms });
    if (!this.active) {
      this.preRoll.push(chunk); if (this.preRoll.length > 3) this.preRoll.shift();
      if (rms >= this.gate.threshold) { this.active = true; for (const c of this.preRoll) this.send(c); this.preRoll = []; }
    } else this.send(chunk);
    if (this.gate.tick(rms, 100) && this.active) { this.port.postMessage({ type:'commit', eligible:!this.gate.forced }); this.active = false; this.sentMs = 0; this.preRoll = []; }
    else if (this.active && this.gate.speech === 0 && rms < this.gate.threshold && this.sentMs >= 900) { this.port.postMessage({ type:'clear' }); this.active = false; this.sentMs = 0; }
  }
  process(inputs) {
    const input = inputs[0]?.[0]; if (!input) return true;
    for (const sample of this.resampler.push(input)) { this.chunk[this.index++] = sample; if (this.index === this.chunk.length) { const ready = this.chunk; this.chunk = new Int16Array(2400); this.index = 0; this.emit(ready); } }
    return true;
  }
}
registerProcessor('interview-microphone', InterviewMicrophone);
