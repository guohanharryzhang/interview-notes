const abortError=()=>new DOMException('Audio capture cancelled.','AbortError');
const denied=(kind,error)=>error.name==='NotAllowedError'
  ? new Error(kind==='system'?'Mac audio sharing was cancelled or denied. Choose Entire Screen and enable Share system audio. If macOS blocks it, allow Google Chrome in System Settings → Privacy & Security → Screen & System Audio Recording.':'Microphone permission was denied. Allow microphone access for this page, or choose Mac audio only.')
  : error;

export async function acquireAudio({mode='system-mic',deviceId='',mediaDevices=navigator.mediaDevices,signal}={}){
  const inputs=[],listeners=[];let stopped=false,failure=null,endedKind=null,endedCallback=null,rejectFailure;
  const failed=new Promise((_,reject)=>{rejectFailure=reject;});failed.catch(()=>{});
  const stop=()=>{stopped=true;for(const [track,handler] of listeners)track.removeEventListener('ended',handler);for(const input of inputs)input.stream.getTracks().forEach(t=>t.stop());signal?.removeEventListener('abort',onAbort);};
  const fail=error=>{if(stopped)return;failure=error;stop();rejectFailure(error);};
  const onAbort=()=>fail(abortError());
  const check=()=>{if(stopped||signal?.aborted)throw failure||abortError();};
  const keep=(kind,stream)=>{
    inputs.push({kind,stream});if(stopped||signal?.aborted){stream.getTracks().forEach(t=>t.stop());check();}
    for(const track of stream.getTracks()){
      check();const handler=()=>{if(stopped)return;endedKind=kind;fail(new Error(kind==='system'?'Mac audio sharing stopped. All capture is paused.':'Microphone disconnected. All capture is paused.'));endedCallback?.(kind);};
      track.addEventListener('ended',handler,{once:true});listeners.push([track,handler]);if(track.readyState==='ended')handler();
    }
    check();return stream;
  };
  const wait=(kind,promise)=>Promise.race([Promise.resolve(promise).then(stream=>keep(kind,stream)),failed]);
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
    check();
    if(mode!=='mic'){
      if(!mediaDevices.getDisplayMedia)throw new Error('Mac audio capture needs Chrome with screen and system audio sharing support.');
      // Invoke before any await so Chrome sees the Start listening user gesture.
      let display;try{display=await wait('system',mediaDevices.getDisplayMedia({
        video:{displaySurface:'monitor',frameRate:{ideal:1,max:1}},
        audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,suppressLocalAudioPlayback:false},
        systemAudio:'include',windowAudio:'system',monitorTypeSurfaces:'include',selfBrowserSurface:'exclude',surfaceSwitching:'exclude'
      }));}catch(error){throw denied('system',error);}
      const video=display.getVideoTracks()[0];
      if(video?.getSettings().displaySurface!=='monitor')throw new Error('Choose Entire Screen to capture sound from all Mac apps. A tab or window captures a narrower source.');
      if(!display.getAudioTracks().some(t=>t.readyState==='live'))throw new Error('No system audio was shared. Start again, select Entire Screen and enable Share system audio. If that option is missing, check Chrome’s Screen & System Audio Recording permission in macOS.');
      // Chrome requires a display track for this API. Keep it alive locally;
      // only getAudioTracks() are connected below. No frames leave the browser.
    }
    check();
    if(mode!=='system'){
      let mic;try{mic=await wait('mic',mediaDevices.getUserMedia({audio:{deviceId:deviceId?{exact:deviceId}:undefined,channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}));}catch(error){throw denied('mic',error);}
      if(!mic.getAudioTracks().some(t=>t.readyState==='live'))throw new Error('No live microphone track was provided.');
    }
    check();
    return {inputs,stop,onEnded(callback){endedCallback=callback;if(endedKind)callback(endedKind);}};
  }catch(error){stop();throw error;}
}

export function connectAudio(context,inputs,worklet){
  const nodes=[],meters=[];
  for(const input of inputs){
    // Strip video and force the worklet to downmix stereo playback to mono.
    const source=context.createMediaStreamSource(new MediaStream(input.stream.getAudioTracks()));
    const gain=context.createGain();gain.gain.value=inputs.length>1?.8:1;
    const analyser=context.createAnalyser();analyser.fftSize=512;
    source.connect(analyser);analyser.connect(gain);gain.connect(worklet);
    nodes.push(source,analyser,gain);meters.push({kind:input.kind,analyser,samples:new Float32Array(analyser.fftSize)});
  }
  const silent=context.createGain();silent.gain.value=0;worklet.connect(silent);silent.connect(context.destination);nodes.push(silent);
  return {levels(){return Object.fromEntries(meters.map(({kind,analyser,samples})=>{analyser.getFloatTimeDomainData(samples);let power=0;for(const n of samples)power+=n*n;return [kind,Math.sqrt(power/samples.length)];}));},disconnect(){for(const node of nodes)node.disconnect();}};
}
