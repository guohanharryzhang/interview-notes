import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { loadExperience } from './data.mjs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { buildCorpus, retrieve, buildPrompt } from './context.mjs';
import { allowedRequest, cleanQuestion } from './security.mjs';
import { answerStream, connectTranscription } from './provider.mjs';
import { selectPrep, personalCue } from './profile.mjs';
import { buildBrief, overviewFacts, isIntroduction } from './brief.mjs';
import { buildLibrary, buildExperienceIndex, selectExperiences, explicitExperiences } from './knowledge.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaults = { company: '', role: 'Interview', posting: '', answerModel: 'gpt-5.4-mini', deepModel: 'gpt-5.4', transcriptionModel: 'gpt-live-transcribe', automatic: true, captureMode: 'system-mic', threshold: .012 };
const service = 'Interview Notes OpenAI';
function keychainKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (process.platform !== 'darwin') return '';
  const r = spawnSync('security', ['find-generic-password', '-s', service, '-a', os.userInfo().username, '-w'], { encoding: 'utf8', timeout: 5000 });
  return r.status === 0 ? r.stdout.trim() : '';
}
async function body(req) {
  let size = 0, parts = [];
  for await (const part of req) { size += part.length; if (size > 100000) throw new Error('Request too large.'); parts.push(part); }
  return JSON.parse(Buffer.concat(parts).toString() || '{}');
}
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
const safeSettings = input => ({ captureMode:['system-mic','system','mic'].includes(input.captureMode)?input.captureMode:'system-mic', stage:['recruiter','technical','manager'].includes(input.stage)?input.stage:'recruiter', focus:['auto','software','hardware','embedded','research','general'].includes(input.focus)?input.focus:'auto', companyResearch:String(input.companyResearch||'').slice(0,8000), motivation:String(input.motivation||'').slice(0,2500), company: String(input.company || '').slice(0,180), role: String(input.role || '').slice(0,240), posting: String(input.posting || '').slice(0,14000), answerModel: ['gpt-5.4-mini', 'gpt-5.4', 'gpt-4.1-mini'].includes(input.answerModel) ? input.answerModel : defaults.answerModel, deepModel: defaults.deepModel, transcriptionModel: ['gpt-live-transcribe', 'gpt-4o-mini-transcribe', 'gpt-4o-transcribe'].includes(input.transcriptionModel) ? input.transcriptionModel : defaults.transcriptionModel, automatic: input.automatic !== false, threshold: Math.min(.05, Math.max(.002, Number(input.threshold) || .012)) });

export async function createApp(options = {}) {
  let port = options.port ?? Number(process.env.PORT || 4319);
  const token = randomBytes(24).toString('hex');
  const runtime = options.runtime || path.join(root, '.runtime'); await mkdir(runtime, { recursive: true, mode: 0o700 });
  let settings = { ...defaults };
  try { settings = { ...defaults, ...safeSettings(JSON.parse(await readFile(path.join(runtime, 'settings.json'), 'utf8'))) }; } catch {}
  const {database: db, databasePath} = await loadExperience({runtime, database: options.database, databasePath: options.databasePath || process.env.EXPERIENCE_DATABASE});
  let supplement=options.supplement||{};
  try{if(!options.supplement)supplement=JSON.parse(await readFile(path.join(runtime,'experience-supplement.json'),'utf8'));}catch{}
  const corpus = buildCorpus(db); const library=buildLibrary(db,supplement);
  let prepProfile=options.prepProfile||null;
  if(!prepProfile)try{prepProfile=JSON.parse(await readFile(path.join(runtime,'call-profile.json'),'utf8'));}catch{}
  let prepProfiles=options.prepProfiles||[];
  if(!options.prepProfiles)try{const data=JSON.parse(await readFile(path.join(runtime,'call-profiles.json'),'utf8'));if(Array.isArray(data))prepProfiles=data;}catch{}
  const profiles=[...prepProfiles,...(prepProfile?[prepProfile]:[])];
  const setupKey=s=>JSON.stringify([String(s.company||'').trim().toLowerCase(),String(s.role||'').trim().toLowerCase()]);
  const setupFields=s=>Object.fromEntries(['company','role','posting','stage','focus','companyResearch','motivation'].map(k=>[k,s[k]||'']));
  let setups=[];try{const data=JSON.parse(await readFile(path.join(runtime,'interview-setups.json'),'utf8'));if(Array.isArray(data))setups=data.map(safeSettings).map(setupFields);}catch{}
  if(settings.company&&!setups.some(s=>setupKey(s)===setupKey(settings)))setups.push(setupFields(settings));
  const normalize=value=>String(value||'').trim().toLowerCase();
  const activePrep=()=>profiles.find(p=>normalize(p.company)===normalize(settings.company)&&p.role&&normalize(p.role)===normalize(settings.role))||profiles.find(p=>normalize(p.company)===normalize(settings.company)&&!p.role)||null;
  const brief=()=>buildBrief(library,settings,activePrep());
  let key = options.key ?? keychainKey();
  const streamAnswer = options.answerStream || answerStream;
  const transcribe = options.connectTranscription || connectTranscription;
  const peers = new Set();
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', `default-src 'self'; connect-src 'self' ws://127.0.0.1:${port} ws://localhost:${port}; script-src 'self'; style-src 'self'; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'`);
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return json(res, 403, { error: 'Invalid host.' });
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { app: 'interview-notes', settings, token, keyConfigured: !!key, facts: corpus.length, owner: db.owner, databaseUpdated: db.updated_at, databasePath, brief:brief(), callCard:activePrep()?.card||[], prepQuestions:activePrep()?.qa?.length||0, prepNotes:activePrep()?.userNotes||[], preparedAnswers:activePrep()?.preparedAnswers||{} });
      if(req.method==='GET'&&url.pathname==='/api/setups')return json(res,200,{setups});
      if(req.method==='GET'&&url.pathname==='/api/library')return json(res,200,{experiences:library});
      if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
        if (!allowedRequest({ host: req.headers.host, origin: req.headers.origin, token: req.headers['x-app-token'] }, port, token)) return json(res, 403, { error: 'Open the app at its localhost address and try again.' });
        const input = await body(req);
        if (url.pathname === '/api/settings') {
          const target={company:input.company??settings.company,role:input.role??settings.role};
          let base=settings;
          if(setupKey(target)!==setupKey(settings))base={...settings,posting:'',stage:'recruiter',focus:'auto',companyResearch:'',motivation:'',...setups.find(s=>setupKey(s)===setupKey(target))};
          const next=safeSettings({...base,...input});
          const nextSetups=next.company?[...setups.filter(s=>setupKey(s)!==setupKey(next)),setupFields(next)]:setups;
          await writeFile(path.join(runtime,'interview-setups.json'),JSON.stringify(nextSetups,null,2),{mode:0o600});
          await writeFile(path.join(runtime,'settings.json'),JSON.stringify(next,null,2),{mode:0o600});
          settings=next;setups=nextSetups;return json(res,200,{settings});
        }
        if (url.pathname === '/api/key') {
          const supplied = typeof input.key === 'string' ? input.key.trim() : '';
          if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(supplied)) return json(res, 400, { error: 'Enter an OpenAI API key beginning with sk-.' });
          key = supplied;
          const saved = process.platform === 'darwin' ? spawnSync('security', ['add-generic-password', '-U', '-s', service, '-a', os.userInfo().username, '-w', key], { encoding: 'utf8', timeout: 10000 }) : { status: 1 };
          return json(res, 200, { keyConfigured: true, persisted: saved.status === 0 });
        }
        if (url.pathname === '/api/answer') {
          const question = cleanQuestion(input.question);
          const prep=selectPrep(activePrep(),question,settings.company);
          let experiences=selectExperiences(library,question,{previousQuestion:String(input.previousQuestion||'').slice(0,6000),deep:!!input.deep});
          if(prep&&experiences.length)prep.story_notes=[];
          const topicHints=prep?.qa.map(q=>q.beats.join(' ')).join(' ').slice(0,800)||'';
          let facts = retrieve(corpus, question+' '+topicHints, 9);
          if(experiences.length){const selected=new Set(experiences.map(e=>e.id));facts=retrieve(corpus.filter(f=>selected.has(f.entity)),question+' '+topicHints,input.deep?24:9);}
          const interviewBrief=brief();
          if(isIntroduction(question)&&!explicitExperiences(library,question).length){
            facts=overviewFacts(corpus,interviewBrief);
            experiences=interviewBrief.stories.map(s=>selectExperiences(library,`Tell me about ${s.title}.`,{deep:!!input.deep})[0]).filter(Boolean);
            if(prep){prep.qa=[];prep.story_notes=[];}
          }
          const experienceIndex=buildExperienceIndex(library);
          const prompt = buildPrompt({ question, facts, settings, prep, experiences, experienceIndex, history: Array.isArray(input.history) ? input.history : [], deep: !!input.deep, profile: corpus.find(x => x.id === 'profile')?.text || '', brief:interviewBrief, style:input.style==='spoken'?'spoken':'outline' });
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
          const send = (event, data) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
          send('sources', { facts:[...facts,...experiences.flatMap(d=>d.observations.map((o,i)=>({id:`observation:${d.id}:${o.id||i}`,title:d.title,text:o.text+'\nScope: '+(o.scope||''),sources:[o.source]}))),...(prep?.qa||[]).map((q,i)=>({id:`prep:${i}`,title:`Prepared question: ${q.q}`,text:`Suggested beats: ${q.beats.join('; ')}\nLimits: ${q.dont}`,sources:q.sources?.length?q.sources:[prep.source]})),...experienceIndex.map(d=>({id:`reference:${d.id}`,title:`Experience reference: ${d.title}`,text:[d.summary,...d.examples.map(o=>o.text+'\nScope: '+(o.scope||'')),...d.evidence.map(c=>c.text+'\nLimits: '+JSON.stringify(c.limits))].join('\n'),sources:[...d.sources,...d.examples.map(o=>o.source)]}))] });
          const companyQuestion=/why|interest|attract|drawn/i.test(question)&&(/company|employer|work here|join you|your organization/i.test(question)||(settings.company&&question.toLowerCase().includes(settings.company.toLowerCase())));
          const companyCue=companyQuestion&&!settings.companyResearch.trim()&&!settings.posting.trim()&&!prep?.company_facts?.length?'Check: Add one specific company fact with a source and your own reason for this role in Setup.\n\nUse: company detail → why it matters to you → one relevant example.':null;
          const cue=personalCue(activePrep(),question)||companyCue;
          if(cue){send('delta',{text:cue,firstTokenMs:0});send('done',{elapsedMs:0,mode:'personal-cue'});return res.end();}
          if (!key) { send('error', { message: 'Add an OpenAI API key in Setup to generate answers. Your source notes are available below.' }); return res.end(); }
          const controller = new AbortController(); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
          const start = Date.now(); let first = null;
          try {
            for await (const event of streamAnswer({ key, prompt, model: input.deep ? settings.deepModel : settings.answerModel, deep: !!input.deep, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(input.deep?75000:35000)]) })) {
              if (event.type === 'delta') { first ??= Date.now() - start; send('delta', { text: event.text, firstTokenMs: first }); }
              if (event.type === 'usage') send('usage', event.usage || {});
            }
            send('done', { elapsedMs: Date.now() - start, firstTokenMs: first });
          } catch (e) { if (!controller.signal.aborted) send('error', { message: e.name === 'TimeoutError' ? 'Answer timed out. Try again or ask a shorter question.' : e.message }); }
          return res.end();
        }
        return json(res, 404, { error: 'Unknown action.' });
      }
      const publicFiles = { '/': 'index.html', '/app.mjs': 'app.mjs', '/style.css': 'style.css', '/state.mjs': 'state.mjs', '/workflow.mjs':'workflow.mjs', '/audio-core.mjs': 'audio-core.mjs', '/audio-capture.mjs':'audio-capture.mjs', '/audio-worklet.js': 'audio-worklet.js' };
      const name = publicFiles[url.pathname]; if (req.method !== 'GET' || !name) return json(res, 404, { error: 'Not found.' });
      const bytes = await readFile(path.join(root, 'public', name));
      res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css' : 'text/javascript'); res.setHeader('Cache-Control', 'no-store'); res.end(bytes);
    } catch (e) { if (!res.headersSent) json(res, 400, { error: e.message }); else res.end(); }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 100000 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname !== '/audio' || !allowedRequest({ host: req.headers.host, origin: req.headers.origin, token: url.searchParams.get('token') }, port, token) || !key) { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, client => { const close = transcribe(client, { key, model: settings.transcriptionModel, company:settings.company, role:settings.role }); peers.add(close); client.once('close', () => peers.delete(close)); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  port = server.address().port;
  return { server, port, token, url: `http://127.0.0.1:${port}`, close: async () => { for (const close of peers) close(); wss.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createApp().then(app => { console.log(`Interview assistant: ${app.url}`); console.log('Audio and transcripts are not saved locally.'); const shutdown = async () => { await app.close(); process.exit(0); }; process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown); }).catch(e => { console.error(e.code === 'EADDRINUSE' ? 'The selected port is already in use. Open the existing app or set PORT.' : e.message); process.exit(1); });
}
