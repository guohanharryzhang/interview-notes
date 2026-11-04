import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {createApp} from '../src/server.mjs';

test('browser: system audio reaches transcription with silent mic, mic also works, and stopping releases all capture',{timeout:40000},async t=>{
  const runtime=await mkdtemp(path.join(os.tmpdir(),'interview-system-audio-'));let audioBytes=0,commits=0;
  const app=await createApp({port:0,runtime,key:'test',database:{owner:'Test',entities:[],claims:[]},answerStream:async function*(){yield {type:'delta',text:'Test answer.'};},connectTranscription:client=>{
    client.send(JSON.stringify({type:'app.ready'}));client.on('message',(data,binary)=>{if(binary)audioBytes+=data.length;else if(JSON.parse(data).type==='commit'){const id=String(++commits);client.send(JSON.stringify({type:'input_audio_buffer.committed',item_id:id,previous_item_id:null}));client.send(JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:'Can you describe your experience?'}));}});return()=>client.close();
  }});
  const browser=await chromium.launch({channel:process.env.TEST_BROWSER==='chromium'?undefined:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  t.after(async()=>{await browser.close();await app.close();await rm(runtime,{recursive:true,force:true});});
  const page=await browser.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.captureInputs={};window.captureRequests=[];
    const RealWorklet=window.AudioWorkletNode;window.AudioWorkletNode=class extends RealWorklet {constructor(...args){super(...args);window.testWorklet=this;}};
    async function input(kind){
      const ctx=new AudioContext();await ctx.resume();const oscillator=ctx.createOscillator(),gain=ctx.createGain(),destination=ctx.createMediaStreamDestination(),silent=ctx.createGain();
      gain.gain.value=0;silent.gain.value=0;oscillator.connect(gain);if(kind==='system'){const stereo=ctx.createChannelMerger(2);gain.connect(stereo,0,1);stereo.connect(destination);}else gain.connect(destination);gain.connect(silent);silent.connect(ctx.destination);oscillator.start();
      const stream=destination.stream;
      if(kind==='system'){const canvas=document.createElement('canvas');const track=canvas.captureStream(1).getVideoTracks()[0];track.getSettings=()=>({displaySurface:window.testSurface||'monitor'});stream.addTrack(track);if(window.testNoAudio)for(const a of stream.getAudioTracks()){a.stop();stream.removeTrack(a);}}
      window.captureInputs[kind]={ctx,gain,stream};return stream;
    }
    navigator.mediaDevices.getDisplayMedia=options=>{window.captureRequests.push(options);return input('system');};
    navigator.mediaDevices.getUserMedia=()=>input('mic');
    window.playInput=kind=>{const {ctx,gain}=window.captureInputs[kind];const start=ctx.currentTime+.1;gain.gain.setValueAtTime(.2,start);gain.gain.setValueAtTime(0,start+.8);};
  });
  await page.goto(app.url);await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Ready');
  assert.equal(await page.locator('#captureMode').inputValue(),'system-mic');
  await page.click('#listen');await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Listening');
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.captureInputs)),['system','mic']);
  await page.evaluate(()=>window.playInput('system'));
  await page.waitForFunction(()=>document.querySelector('#systemAudioStatus').textContent.includes('detected'));
  await page.waitForFunction(()=>document.querySelectorAll('#transcript .turn').length===1);
  assert.ok(audioBytes>4800);const firstBytes=audioBytes;
  await page.evaluate(()=>window.playInput('mic'));
  await page.waitForFunction(()=>document.querySelector('#microphoneAudioStatus').textContent.includes('detected'));
  await page.waitForFunction(()=>document.querySelectorAll('#transcript .turn').length===2);
  assert.ok(audioBytes>firstBytes);await page.click('#pause');
  assert.ok(await page.evaluate(()=>Object.values(window.captureInputs).every(i=>i.stream.getTracks().every(t=>t.readyState==='ended'))));
  const stoppedBytes=audioBytes;await page.waitForTimeout(300);assert.equal(audioBytes,stoppedBytes);
  await page.evaluate(()=>{window.testNoAudio=true;});await page.click('#listen');
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('No system audio'));
  assert.equal(await page.locator('#listen').isEnabled(),true);assert.notEqual(await page.locator('#connection').textContent(),'Listening');
  await page.evaluate(()=>{window.testNoAudio=false;});await page.click('#listen');await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Listening');
  await page.evaluate(()=>window.captureInputs.system.stream.getVideoTracks()[0].dispatchEvent(new Event('ended')));
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Mac audio sharing stopped'));
  assert.ok(await page.evaluate(()=>Object.values(window.captureInputs).every(i=>i.stream.getTracks().every(t=>t.readyState==='ended'))));
  await page.click('#listen');await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Listening');
  await page.evaluate(()=>window.testWorklet.dispatchEvent(new Event('processorerror')));
  await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Audio processing stopped'));
  assert.ok(await page.evaluate(()=>Object.values(window.captureInputs).every(i=>i.stream.getTracks().every(t=>t.readyState==='ended'))));
  await page.evaluate(()=>{window.AudioWorkletNode=class {constructor(){throw new Error('Audio processing could not start.');}};});
  await page.click('#listen');await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Audio processing could not start'));
  assert.ok(await page.evaluate(()=>Object.values(window.captureInputs).every(i=>i.stream.getTracks().every(t=>t.readyState==='ended'))));
  assert.equal(await page.locator('#listen').isEnabled(),true);
  assert.deepEqual(errors,[]);
});
