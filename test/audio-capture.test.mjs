import test from 'node:test';
import assert from 'node:assert/strict';
import {acquireAudio} from '../public/audio-capture.mjs';

function track(kind,settings={}){const t=new EventTarget();return Object.assign(t,{kind,readyState:'live',enabled:true,getSettings:()=>settings,stop(){this.readyState='ended';}});}
function stream(tracks){return {getTracks:()=>tracks,getAudioTracks:()=>tracks.filter(t=>t.kind==='audio'),getVideoTracks:()=>tracks.filter(t=>t.kind==='video')};}
function fixtures({surface='monitor',audio=true}={}){const system=stream([track('video',{displaySurface:surface}),...(audio?[track('audio')]:[])]),mic=stream([track('audio')]);const calls=[];return {system,mic,calls,mediaDevices:{getDisplayMedia:async c=>{calls.push(['display',c]);return system;},getUserMedia:async c=>{calls.push(['mic',c]);return mic;}}};}

test('system and mic capture starts the chooser first and releases both sources',async()=>{
  const f=fixtures();const pending=acquireAudio({mediaDevices:f.mediaDevices});
  assert.equal(f.calls[0][0],'display','display capture must start during the click, before any await');
  const capture=await pending;assert.deepEqual(capture.inputs.map(i=>i.kind),['system','mic']);
  assert.equal(f.calls[0][1].systemAudio,'include');assert.equal(f.calls[0][1].audio.suppressLocalAudioPlayback,false);
  capture.stop();assert.ok([...f.system.getTracks(),...f.mic.getTracks()].every(t=>t.readyState==='ended'));
});
test('a video-only selection is rejected without silently starting the microphone',async()=>{
  const f=fixtures({audio:false});await assert.rejects(acquireAudio({mediaDevices:f.mediaDevices}),/system audio/i);
  assert.equal(f.calls.length,1);assert.ok(f.system.getTracks().every(t=>t.readyState==='ended'));
});
test('tab-only selection is rejected when all Mac sound was requested',async()=>{
  const f=fixtures({surface:'browser'});await assert.rejects(acquireAudio({mediaDevices:f.mediaDevices}),/Entire Screen/);
  assert.equal(f.calls.length,1);assert.ok(f.system.getTracks().every(t=>t.readyState==='ended'));
});
test('microphone denial stops previously acquired system capture',async()=>{
  const f=fixtures();f.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');};
  await assert.rejects(acquireAudio({mediaDevices:f.mediaDevices}),/microphone/i);
  assert.ok(f.system.getTracks().every(t=>t.readyState==='ended'));
});
test('a cancelled pending chooser stops its late result and never opens the mic',async()=>{
  const f=fixtures();let resolve;f.mediaDevices.getDisplayMedia=()=>new Promise(r=>{resolve=r;});const control=new AbortController();
  const result=acquireAudio({mediaDevices:f.mediaDevices,signal:control.signal});control.abort();resolve(f.system);
  await assert.rejects(result,{name:'AbortError'});assert.ok(f.system.getTracks().every(t=>t.readyState==='ended'));assert.equal(f.calls.length,0);
});
test('cancelling a pending microphone immediately releases system capture and releases the late mic',async()=>{
  const f=fixtures();let resolve;f.mediaDevices.getUserMedia=()=>new Promise(r=>{resolve=r;});const control=new AbortController();
  const result=acquireAudio({mediaDevices:f.mediaDevices,signal:control.signal});await new Promise(r=>setImmediate(r));
  control.abort();assert.ok(f.system.getTracks().every(t=>t.readyState==='ended'));resolve(f.mic);
  await assert.rejects(result,{name:'AbortError'});assert.equal(f.mic.getAudioTracks()[0].readyState,'ended');
});
test('an ended capture track notifies the app and stopping is idempotent',async()=>{
  const f=fixtures();let ended;const capture=await acquireAudio({mediaDevices:f.mediaDevices});capture.onEnded(kind=>{ended=kind;});
  f.system.getVideoTracks()[0].dispatchEvent(new Event('ended'));assert.equal(ended,'system');capture.stop();capture.stop();
});
test('an ended source is reported even if it ended before the app registered its listener',async()=>{
  const f=fixtures();const capture=await acquireAudio({mediaDevices:f.mediaDevices});let ended;
  f.system.getAudioTracks()[0].dispatchEvent(new Event('ended'));capture.onEnded(kind=>{ended=kind;});
  assert.equal(ended,'system');
});
test('a system track ending during microphone permission releases siblings and rejects without waiting for permission',async()=>{
  const f=fixtures();let resolve;f.mediaDevices.getUserMedia=()=>new Promise(r=>{resolve=r;});
  const result=acquireAudio({mediaDevices:f.mediaDevices});await new Promise(r=>setImmediate(r));
  f.system.getVideoTracks()[0].readyState='ended';f.system.getVideoTracks()[0].dispatchEvent(new Event('ended'));
  assert.ok(f.system.getTracks().every(t=>t.readyState==='ended'),'all acquired tracks must stop immediately');
  await assert.rejects(result,/sharing stopped/i);
  resolve(f.mic);await new Promise(r=>setImmediate(r));assert.equal(f.mic.getAudioTracks()[0].readyState,'ended');
});
test('explicit microphone-only and system-only modes acquire only their requested source',async()=>{
  for(const mode of ['mic','system']){const f=fixtures();const capture=await acquireAudio({mode,mediaDevices:f.mediaDevices});assert.deepEqual(capture.inputs.map(i=>i.kind),[mode]);assert.equal(f.calls.length,1);capture.stop();}
});
