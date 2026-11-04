import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {createApp} from '../src/server.mjs';

test('six topic buttons show role-specific prepared wording without generating; export and follow-ups still work',async t=>{
  const runtime=await mkdtemp(path.join(os.tmpdir(),'prepared-interview-'));
  const preparedAnswers=Object.fromEntries(['intro','why','project','failure','conflict','questions'].map(topic=>[topic,{question:`Prepared ${topic} question`,text:`My ${topic} answer.\n\nSpecific details for this role.`}]));
  await writeFile(path.join(runtime,'settings.json'),JSON.stringify({company:'Example',role:'Hardware Intern'}));
  const calls=[];
  const app=await createApp({port:0,runtime,key:'test',database:{entities:[],claims:[]},prepProfiles:[{id:'hardware',company:'Example',role:'Hardware Intern',qa:[],preparedAnswers},{id:'software',company:'Example',role:'Software Intern',qa:[],preparedAnswers:{intro:{question:'Software introduction',text:'Different wording for software.'}}}],answerStream:async function*(r){calls.push(r);yield {type:'delta',text:'Generated follow-up.'};}});
  const browser=await chromium.launch({channel:process.env.TEST_BROWSER==='chromium'?undefined:'chrome',headless:true});
  t.after(async()=>{await browser.close();await app.close();await rm(runtime,{recursive:true,force:true});});
  const page=await browser.newPage({acceptDownloads:true});page.setDefaultTimeout(4000);
  const errors=[],answerRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/answer'))answerRequests.push(r);});
  await page.goto(app.url);await page.waitForFunction(()=>document.querySelector('#connection').textContent==='Ready');
  const config=await(await fetch(app.url+'/api/config')).json();
  assert.deepEqual(config.preparedAnswers,preparedAnswers);
  for(const [topic,entry] of Object.entries(preparedAnswers)){
    await page.click(`[data-topic="${topic}"]`);
    assert.equal(await page.textContent('#answer'),entry.text);
    assert.equal(await page.inputValue('#question'),entry.question);
    assert.equal(await page.textContent('#answerState'),'Prepared answer');
    assert.equal(await page.isEnabled('#copy'),true);
  }
  assert.equal(answerRequests.length,0);assert.equal(calls.length,0);
  const downloaded=page.waitForEvent('download');await page.click('#referenceButton');await page.click('#exportSession');
  const saved=JSON.parse(await readFile(await(await downloaded).path(),'utf8'));
  assert.equal(saved.transcript.length,0);assert.equal(saved.generatedSuggestions.length,6);
  assert.ok(saved.generatedSuggestions.every(s=>s.style==='prepared'&&s.spoken===false));
  await page.click('#details');await page.waitForFunction(()=>document.querySelector('#answerState').textContent==='Ready');
  assert.equal(calls.length,1);assert.equal(calls[0].deep,true);
  await page.click('#setupButton');await page.fill('#role','Software Intern');await page.click('#saveSettings');
  await page.waitForFunction(()=>!document.querySelector('#setup').open);
  await page.click('[data-topic="intro"]');assert.equal(await page.textContent('#answer'),'Different wording for software.');
  await page.click('[data-topic="failure"]');await page.waitForFunction(()=>document.querySelector('#answerState').textContent==='Ready');
  assert.equal(calls.length,2);assert.equal(await page.textContent('#answer'),'Generated follow-up.');
  assert.deepEqual(errors,[]);
});
