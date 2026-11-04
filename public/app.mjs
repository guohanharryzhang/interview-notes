import { Transcript, likelyQuestion } from './state.mjs';
import { QuestionGate, sessionExport, renderAnswer } from './workflow.mjs';
import { acquireAudio, connectAudio } from './audio-capture.mjs';
const $ = id => document.getElementById(id);
let experienceLibrary=[], savedSetups=[], suggestions=[], gate=new QuestionGate(), draftKey='', sessionStartedAt=null, sessionDirty=false, sessionGeneration=0, activeSuggestion=null;
const prepFields=['company','role','posting','stage','focus','companyResearch','motivation'];
const setupKey=s=>JSON.stringify([String(s.company||'').trim().toLowerCase(),String(s.role||'').trim().toLowerCase()]);
let config, transcript = new Transcript(), captureSession=null, listening = false, starting = false, captureRun = 0, answerRun = 0, answerAbort, answerText = '', lastQuestion = '', elapsed = 0, lastTick, pendingCommits = [], activeQuestionId = null, sessionHistory = [];
const notice = message => { $('notice').textContent = message || ''; $('notice').hidden = !message; };
const status = (text, live = false) => { $('connection').textContent = text; $('connection').classList.toggle('live', live); };
async function post(path, value) { const r = await fetch(path, { method:'POST', headers:{ 'Content-Type':'application/json', 'X-App-Token':config.token }, body:JSON.stringify(value) }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Request failed.'); return data; }
function displayConfig() {
  const s = config.settings; $('interviewLabel').textContent = [s.company,s.role].filter(Boolean).join(' · ');
  for (const id of [...prepFields,'answerModel','transcriptionModel','threshold']) $(id).value = s[id]??'';
  $('automatic').checked = s.automatic; $('keyStatus').textContent = config.keyConfigured ? 'Key configured' : 'Not configured';
  if(!listening&&!starting){$('captureMode').value=s.captureMode||'system-mic';showCaptureMode();}
  $('databaseStatus').textContent = `${config.facts} source records loaded from your experience database.`;
  $('callCard').hidden=!(config.callCard?.length);$('callFacts').replaceChildren();$('prepNotes').replaceChildren();
  for(const [label,value] of config.callCard||[]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;$('callFacts').append(dt,dd);}
  for(const note of config.prepNotes||[]){const p=document.createElement('p');p.textContent=note;$('prepNotes').append(p);}
  if(config.prepQuestions)$('databaseStatus').textContent+=` ${config.prepQuestions} prepared questions loaded for this call.`;
  if($('example'))$('example').textContent='Try your introduction';
  $('question').placeholder='What did you personally build, and how did you check it worked?';
  draftKey=setupKey(s);showBrief();
  if (!listening && !starting) status(config.keyConfigured ? 'Ready' : 'API key needed');
}
async function devices() {
  try { const current = $('device').value; const list = await navigator.mediaDevices.enumerateDevices(); $('device').replaceChildren(new Option('Default microphone','')); list.filter(d=>d.kind==='audioinput'&&d.deviceId!=='default').forEach((d,i)=>$('device').append(new Option(d.label || `Microphone ${i+1}`,d.deviceId))); $('device').value = current; } catch {}
}
function showSources(facts) {
  $('sourceCount').textContent = `(${facts.length})`; $('sources').replaceChildren();
  for (const f of facts) { const box = document.createElement('div'); box.className='fact'; const title=document.createElement('strong'); title.textContent=f.title; const p=document.createElement('p'); p.textContent=f.text; const code=document.createElement('code'); code.textContent=f.id; box.append(title,p,code); $('sources').append(box); }
}
function renderTranscript() {
  sessionDirty=true;sessionStartedAt||=new Date().toISOString();$('exportSession').disabled=false;
  const box=$('transcript'); const nearEnd=box.scrollHeight-box.scrollTop-box.clientHeight<90; box.replaceChildren();
  for (const turn of transcript.turns()) { if (!turn.text) continue; const button=document.createElement('button'); button.className=`turn ${turn.done?'':'partial'}`; const label=document.createElement('small'); label.textContent=turn.done?'Use as question':'Hearing…'; const text=document.createElement('span'); text.textContent=turn.text; button.append(label,text); button.onclick=()=>{ $('question').value=turn.text; ask(turn.text); }; box.append(button); }
  if (nearEnd) box.scrollTop=box.scrollHeight;
}
async function ask(question, deep=false, style='outline') {
  $('reference').close();
  question=question.trim(); if (!question) { notice('Type a question or select a line from the transcript.'); return; }
  const previousQuestion=lastQuestion;answerAbort?.abort(); const run=++answerRun; answerAbort=new AbortController(); lastQuestion=question; answerText='';
  $('question').value=question; $('answer').textContent=''; $('answer').classList.add('streaming'); $('answerState').textContent=deep?'Working through the details…':'Preparing notes…'; $('timing').textContent=''; $('details').disabled=true; $('copy').disabled=true; notice('');
  const began=performance.now(), createdAt=new Date().toISOString(), generation=sessionGeneration; let received=false, completed=false, generated='', resultStatus='partial';
  const record={createdAt,question,text:'',style:deep?'deep':style,status:'partial'};activeSuggestion=record;
  sessionStartedAt||=createdAt;$('spokenAnswer').disabled=true;
  try {
    const response=await fetch('/api/answer',{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':config.token},body:JSON.stringify({question,previousQuestion,deep,style,history:[...transcript.finalTurns().slice(-7).map(t=>t.text),...sessionHistory.slice(-3)]}),signal:answerAbort.signal});
    if (!response.ok) throw new Error((await response.json()).error || 'Could not generate notes.');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;
      while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);if(run!==answerRun)return;const kind=block.match(/^event: (.*)$/m)?.[1],line=block.match(/^data: (.*)$/m)?.[1];if(!line)continue;const data=JSON.parse(line);
        if(kind==='sources')showSources(data.facts);
        if(kind==='delta'){if(!received){$('timing').textContent=`First notes in ${((performance.now()-began)/1000).toFixed(1)}s`;received=true;}generated+=data.text;record.text=generated;answerText=generated;renderAnswer($('answer'),answerText,!deep&&style==='outline');$('answerState').textContent=deep?'Adding detail…':'Writing…';}
        if(kind==='error')throw new Error(data.message);
        if(kind==='done'){completed=true;resultStatus='complete';$('answerState').textContent=data.mode==='personal-cue'?'Add your own detail':'Ready';if(data.mode!=='personal-cue')sessionHistory.push(`Question: ${question}\nAnswer notes: ${answerText}`);if(sessionHistory.length>10)sessionHistory.shift();}
      }
    }
    if(!completed)throw new Error('The answer connection ended early. Please retry.');
  } catch(error) { if(error.name!=='AbortError'&&run===answerRun){notice(error.message);$('answerState').textContent='Needs attention';if(!answerText)$('answer').textContent='Your relevant source notes are below. You can correct the question and try again.';} }
  finally { if(generated&&generation===sessionGeneration){record.status=resultStatus;suggestions.push(record);sessionDirty=true;$('exportSession').disabled=false;}if(activeSuggestion===record)activeSuggestion=null;if(run===answerRun){$('spokenAnswer').disabled=!answerText;$('answer').classList.remove('streaming');$('details').disabled=!answerText;$('copy').disabled=!answerText;} }
}
function receive(event) {
  const e=JSON.parse(event.data);
  if(e.type==='app.error'){notice(e.message);stopListening();return;}
  if(e.type==='input_audio_buffer.committed'){transcript.commit(e.item_id,e.previous_item_id,pendingCommits.shift() ?? true);return;}
  if(e.type==='conversation.item.input_audio_transcription.delta'){transcript.delta(e.item_id,e.delta);renderTranscript();return;}
  if(e.type==='conversation.item.input_audio_transcription.completed'){
    const turn=transcript.complete(e.item_id,e.transcript);renderTranscript();
    if(turn.eligible&&likelyQuestion(turn.text)){
      const latest=transcript.turns().at(-1);
      if(latest?.id===turn.id){
        const action=gate.offer(turn.text,turn.id,$('automatic').checked&&document.activeElement!==$('question'));
        showPending();if(action==='answer'){activeQuestionId=turn.id;ask(turn.text);}
      }
    }
  }
}
async function startListening() {
  if(listening||starting)return;
  if(!config.keyConfigured){$('setup').showModal();$('apiKey').focus();notice('Add your API key in Setup before starting live audio.');return;}
  const run=++captureRun;starting=true;notice('');status('Connecting…');$('listen').disabled=true;$('pause').disabled=false;$('captureMode').disabled=true;
  const session={run,abort:new AbortController(),context:null,capture:null,graph:null,worklet:null,socket:null,meters:null,timeout:null};captureSession=session;
  try {
    session.context=new AudioContext();
    // Start the browser chooser synchronously in the click gesture, before awaiting microphone permission.
    const acquiring=acquireAudio({mode:$('captureMode').value,deviceId:$('device').value,signal:session.abort.signal});
    const [,capture]=await Promise.all([session.context.resume(),acquiring]);
    if(run!==captureRun){capture.stop();return;}session.capture=capture;devices();
    capture.onEnded(kind=>{if(run===captureRun){notice(kind==='system'?'Mac audio sharing stopped. All capture is paused. Start listening to share it again.':'Microphone disconnected. All capture is paused.');stopListening();}});
    if(run!==captureRun)return;
    await session.context.audioWorklet.addModule('/audio-worklet.js');if(run!==captureRun)return;
    const socket=session.socket=new WebSocket(`ws://${location.host}/audio?token=${encodeURIComponent(config.token)}`);socket.binaryType='arraybuffer';
    session.timeout=setTimeout(()=>{if(run===captureRun){notice('Audio connection timed out. Capture has stopped; try again.');stopListening();}},15000);
    socket.onmessage=event=>{
      if(run!==captureRun)return;
      const e=JSON.parse(event.data);
      if(e.type==='app.ready'){
        if(session.worklet)return;
        try{
        const worklet=session.worklet=new AudioWorkletNode(session.context,'interview-microphone',{channelCount:1,channelCountMode:'explicit',channelInterpretation:'speakers',processorOptions:{threshold:Number($('threshold').value)}});
        worklet.addEventListener('processorerror',()=>{if(run===captureRun){notice('Audio processing stopped. All capture is paused; start again.');stopListening();}},{once:true});
        session.graph=connectAudio(session.context,capture.inputs,worklet);
        worklet.port.onmessage=event=>{if(run!==captureRun)return;const m=event.data;if(m.type==='level'){$('level').style.width=`${Math.min(100,m.rms*1600)}%`;return;}if(socket?.readyState!==WebSocket.OPEN)return;if(m.type==='audio')socket.send(m.buffer);if(m.type==='commit'){pendingCommits.push(m.eligible);socket.send(JSON.stringify({type:'commit'}));}if(m.type==='clear')socket.send(JSON.stringify({type:'clear'}));};
        const seen={},began=Date.now();session.meters=setInterval(()=>{
          if(run!==captureRun)return;
          for(const [kind,level] of Object.entries(session.graph.levels())){
            const prefix=kind==='system'?'systemAudio':'microphoneAudio';if(level>.003)seen[kind]=true;
            $(prefix+'Level').style.width=`${Math.min(100,level*1600)}%`;
            $(prefix+'Status').textContent=level>.003?'Audio detected':seen[kind]?'Connected · quiet':Date.now()-began>10000?'No sound yet · test source':'Connected · waiting for sound';
          }
        },100);
        clearTimeout(session.timeout);listening=true;starting=false;lastTick=Date.now();status('Listening',true);$('micStatus').textContent=capture.inputs.length===2?'Mac audio + microphone on':capture.inputs[0].kind==='system'?'Mac audio on':'Microphone on';$('listen').textContent='Listening';
        }catch(error){notice(error.message);stopListening();}return;
      }receive(event);
    };
    socket.onerror=()=>{if(run===captureRun){notice('Live audio could not connect. Check Setup and your network.');stopListening();}};
    socket.onclose=()=>{if(run===captureRun&&(listening||starting)){notice('Audio disconnected. Press Start listening to reconnect.');stopListening();}};
  } catch(error) { if(run===captureRun){notice(error.message);stopListening();} }
}
function stopListening() {
  captureRun++;listening=false;starting=false;const session=captureSession;captureSession=null;
  if(session){
    session.abort.abort();session.capture?.stop();clearInterval(session.meters);clearTimeout(session.timeout);
    if(session.socket){session.socket.onclose=null;session.socket.onerror=null;session.socket.close();}
    session.worklet?.disconnect();session.worklet?.port.close();session.graph?.disconnect();session.context?.close().catch(()=>{});
  }
  for(const prefix of ['systemAudio','microphoneAudio']){$(prefix+'Status').textContent='Off';$(prefix+'Level').style.width='0%';}
  pendingCommits=[];$('listen').disabled=false;$('listen').textContent='Start listening';$('pause').disabled=true;$('captureMode').disabled=false;$('micStatus').textContent='Audio off';$('level').style.width='0%';status(config?.keyConfigured?'Paused':'API key needed');
}
function showCaptureMode(){const mode=$('captureMode').value;$('systemAudioRow').hidden=mode==='mic';$('microphoneAudioRow').hidden=mode==='system';$('captureHint').textContent=mode==='mic'?'For a phone on speaker near your Mac. This mode does not capture Mac playback.':'Choose Entire Screen and enable Share system audio when Chrome asks. Works with headphones.';}
$('captureMode').onchange=()=>{showCaptureMode();post('/api/settings',{captureMode:$('captureMode').value}).then(result=>{config.settings=result.settings;}).catch(e=>notice(e.message));};
$('listen').onclick=startListening;$('pause').onclick=stopListening;
$('referenceButton').onclick=()=>$('reference').showModal();$('closeReference').onclick=()=>$('reference').close();
$('setupButton').onclick=()=>{displayConfig();loadSetups();$('setup').showModal();devices();};$('closeSetup').onclick=()=>$('setup').close();
$('questionForm').onsubmit=e=>{e.preventDefault();ask($('question').value || transcript.finalTurns().at(-1)?.text || '');};
$('spokenAnswer').onclick=()=>ask(lastQuestion,false,'spoken');
$('details').onclick=()=>ask(lastQuestion,true);$('copy').onclick=()=>navigator.clipboard.writeText(answerText).then(()=>{$('answerState').textContent='Copied';}).catch(()=>notice('Select the notes and copy them manually.'));
$('example').onclick=()=>ask('Tell me about yourself.');
$('automatic').onchange=()=>{config.settings.automatic=$('automatic').checked;post('/api/settings',{automatic:$('automatic').checked}).catch(e=>notice(e.message));};
function clearSession(){stopListening();answerAbort?.abort();answerRun++;elapsed=0;transcript=new Transcript();sessionHistory=[];suggestions=[];activeSuggestion=null;lastQuestion='';gate=new QuestionGate();sessionGeneration++;sessionStartedAt=null;sessionDirty=false;$('exportSession').disabled=true;$('holdAnswer').checked=false;$('spokenAnswer').disabled=true;showPending();activeQuestionId=null;$('transcript').replaceChildren();$('question').value='';$('answer').textContent='Ready for the next question.';answerText='';$('answer').classList.remove('streaming');$('sources').replaceChildren();$('sourceCount').textContent='';$('details').disabled=true;$('copy').disabled=true;$('answerState').textContent='';$('timing').textContent='';notice('');}
$('clear').onclick=()=>{$('reference').close();clearSession();};
$('settingsForm').onsubmit=async e=>{e.preventDefault();$('saveSettings').disabled=true;$('setupError').textContent='';try{
  const next={};for(const id of [...prepFields,'answerModel','transcriptionModel','threshold'])next[id]=$(id).value;
  const changed=setupKey(next)!==setupKey(config.settings);
  if(changed&&sessionDirty&&transcript.turns().length&&!window.confirm('Changing interviews clears the current transcript and notes. Cancel to download the session first. Continue?'))return;
  const result=await post('/api/settings',next);if(changed)clearSession();config.settings=result.settings;
  if($('apiKey').value.trim()){const keyResult=await post('/api/key',{key:$('apiKey').value.trim()});config.keyConfigured=keyResult.keyConfigured;$('apiKey').value='';if(!keyResult.persisted)notice('The key is available for this session, but Keychain could not save it.');}
  config=await(await fetch('/api/config')).json();displayConfig();loadSetups();$('setup').close();if(listening||starting)notice('Saved. Pause and restart listening to apply microphone or transcription changes.');
}catch(error){$('setupError').textContent=error.message;}finally{$('saveSettings').disabled=false;}};
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!$('setup').open&&!$('reference').open){e.preventDefault();ask($('question').value || transcript.finalTurns().at(-1)?.text || '');}if(e.key==='Escape'&&!$('setup').open&&!$('reference').open){answerAbort?.abort();answerRun++;$('answer').classList.remove('streaming');$('answerState').textContent='Cancelled';}});
window.addEventListener('beforeunload',event=>{if(sessionDirty&&transcript.turns().length){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',stopListening);
function selectedExperience(){return experienceLibrary.find(d=>d.id===$('experience').value);}
$('readExperience').onclick=()=>{$('reference').close();const d=selectedExperience();if(!d)return;answerAbort?.abort();answerRun++;lastQuestion=`Walk me through ${d.title} in detail.`;
  answerText=[d.title,[d.role,d.organization,d.dates].filter(Boolean).join(' · '),d.pitch,d.overview,'Details',...d.evidence.map(c=>`• ${c.text}\n  Contribution: ${c.ownership}${c.limits.length?'\n  Limits: '+c.limits.join(' '):''}`),...d.observations.map(o=>`• ${o.text}\n  Source: ${o.source}\n  Scope: ${o.scope}`),'Questions to prepare',...d.followUps.map(q=>'• '+q),'Details to supply',...d.gaps.map(q=>'• '+q)].filter(Boolean).join('\n\n');
  renderAnswer($('answer'),answerText,false);$('answer').classList.remove('streaming');$('question').value=lastQuestion;$('answerState').textContent='Source notes · no API call';$('timing').textContent='';$('details').disabled=false;$('spokenAnswer').disabled=false;$('copy').disabled=false;showSources([]);notice('');};
$('deepExperience').onclick=()=>{const d=selectedExperience();if(d)ask(`Walk me through ${d.title} in depth: the problem, my contribution, technical design, validation, results and likely follow-up questions.`,true);};
setInterval(()=>{if(listening){const now=Date.now();elapsed+=now-lastTick;lastTick=now;}const seconds=Math.floor(elapsed/1000);$('clock').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;},1000);
try {config=await(await fetch('/api/config')).json();displayConfig();devices();if(!config.keyConfigured)notice('Add an OpenAI API key in Setup. You can already type a question to find relevant facts in your database.');}catch(error){notice('Could not reach the local app. Relaunch Interview Assistant.');status('Disconnected');$('listen').disabled=true;}
try{experienceLibrary=(await(await fetch('/api/library')).json()).experiences;$('experience').replaceChildren(...experienceLibrary.map(d=>new Option(d.title,d.id)));const first=config.brief?.stories[0]?.id;if(first)$('experience').value=first;}catch{$('experience').replaceChildren(new Option('Reference unavailable',''));$('readExperience').disabled=true;$('deepExperience').disabled=true;}

function showBrief(){
  const brief=config.brief;if(!brief)return;
  $('focusLabel').textContent=brief.label;$('roleBrief').replaceChildren();
  for(const story of brief.stories){const b=document.createElement('button');b.className='story-link';b.textContent=story.title;b.onclick=()=>ask(`Walk me through my work on ${story.title} and its relevance to this role.`);$('roleBrief').append(b);}
  $('closingQuestions').replaceChildren();for(const question of brief.questions){const li=document.createElement('li');li.textContent=question;$('closingQuestions').append(li);}
}
function showPending(){const q=gate.pending;$('pendingQuestion').hidden=!q;$('pendingText').textContent=q?.text||'';}
function showPreparedAnswer(entry){
  answerAbort?.abort();answerRun++;activeSuggestion=null;
  lastQuestion=entry.question;answerText=entry.text;
  $('question').value=lastQuestion;renderAnswer($('answer'),answerText,false);
  $('answer').classList.remove('streaming');$('answer').scrollTop=0;
  $('answerState').textContent='Prepared answer';$('timing').textContent='';
  $('details').disabled=false;$('spokenAnswer').disabled=false;$('copy').disabled=false;showSources([]);notice('');
  const createdAt=new Date().toISOString();sessionStartedAt||=createdAt;
  suggestions.push({createdAt,question:lastQuestion,text:answerText,style:'prepared',status:'complete'});
  sessionHistory.push(`Question: ${lastQuestion}\nPrepared answer notes: ${answerText}`);if(sessionHistory.length>10)sessionHistory.shift();
  sessionDirty=true;$('exportSession').disabled=false;
}
$('holdAnswer').onchange=()=>{gate.held=$('holdAnswer').checked;};
$('usePending').onclick=()=>{const q=gate.take();showPending();if(q)ask(q.text);};
$('quickTopics').onclick=event=>{
  const topic=event.target.closest('[data-topic]')?.dataset.topic;if(!topic)return;
  const prepared=config.preparedAnswers?.[topic];if(prepared?.text){showPreparedAnswer(prepared);return;}
  const company=config.settings.company||'this company',project=config.brief?.stories[0]?.title;
  const prompts={intro:'Tell me about yourself.',why:`Why are you interested in ${company} and this role?`,project:project?`Walk me through my work on ${project} and its relevance to this role.`:'Tell me about a relevant project.',failure:'Tell me about a mistake you made and what you changed.',conflict:'Tell me about a disagreement and how you handled it.',questions:'What questions should I ask the interviewer about this role?'};
  ask(prompts[topic]);
};
async function loadSetups(){
  try{savedSetups=(await(await fetch('/api/setups')).json()).setups;$('savedSetup').replaceChildren(new Option('Choose a saved interview…',''),...savedSetups.map((s,i)=>new Option([s.company,s.role].join(' · '),String(i))));const i=savedSetups.findIndex(s=>setupKey(s)===setupKey(config.settings));$('savedSetup').value=i<0?'':String(i);}catch{notice('Saved interview setups could not be loaded.');}
}
function fillPrep(setup){for(const key of prepFields)$(key).value=setup[key]||({stage:'recruiter',focus:'auto'}[key]||'');draftKey=setupKey(setup);}
$('savedSetup').onchange=()=>{const s=savedSetups[Number($('savedSetup').value)];if($('savedSetup').value!==''&&s)fillPrep(s);};
function identityChanged(){
  const identity={company:$('company').value,role:$('role').value};const key=setupKey(identity);if(key===draftKey)return;
  const saved=savedSetups.find(s=>setupKey(s)===key);fillPrep(saved||identity);$('savedSetup').value=saved?String(savedSetups.indexOf(saved)):'';
}
$('company').onchange=identityChanged;$('role').onchange=identityChanged;
$('exportSession').onclick=()=>{
  $('reference').close();
  const data=sessionExport({settings:config.settings,turns:transcript.turns(),suggestions:activeSuggestion?.text?[...suggestions,activeSuggestion]:suggestions,startedAt:sessionStartedAt,elapsedMs:elapsed});
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`Interview_${(config.settings.company||'Session').replace(/[^a-z0-9_-]+/gi,'_')}_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);sessionDirty=false;notice('Session downloaded. Transcript and generated suggestions are labeled separately.');
};
loadSetups();
