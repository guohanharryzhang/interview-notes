import test from 'node:test';
import assert from 'node:assert/strict';
let Processor;
globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class { constructor() { this.messages=[]; this.port={postMessage:m=>this.messages.push(structuredClone(m))}; } };
globalThis.registerProcessor = (_name, processor) => { Processor=processor; };
await import('../public/audio-worklet.js');
const feed = (processor, amplitude, chunks) => { for(let i=0;i<chunks;i++)processor.process([[new Float32Array(4800).fill(amplitude)]]); };
test('microphone worklet sends no ambient silence, then one complete speech segment', () => {
  const processor = new Processor({processorOptions:{threshold:.012}});
  feed(processor,0,20);
  assert.equal(processor.messages.filter(m=>m.type==='audio').length,0);
  feed(processor,.1,8);feed(processor,0,10);
  assert.ok(processor.messages.some(m=>m.type==='audio'&&m.buffer.byteLength===4800));
  assert.equal(processor.messages.filter(m=>m.type==='commit').length,1);
  assert.equal(processor.messages.find(m=>m.type==='commit').eligible,true);
  const n=processor.messages.filter(m=>m.type==='audio').length;feed(processor,0,20);
  assert.equal(processor.messages.filter(m=>m.type==='audio').length,n);
});
test('microphone worklet discards a short noise blip', () => {
  const processor = new Processor({processorOptions:{threshold:.012}});
  feed(processor,.1,1);feed(processor,0,15);
  assert.equal(processor.messages.filter(m=>m.type==='commit').length,0);
  assert.equal(processor.messages.filter(m=>m.type==='clear').length,1);
});
