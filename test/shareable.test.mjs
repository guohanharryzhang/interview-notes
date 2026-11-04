import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../src/server.mjs';
import {buildLibrary, explicitExperiences} from '../src/knowledge.mjs';
import {buildBrief} from '../src/brief.mjs';
import {buildCorpus, retrieve, buildPrompt} from '../src/context.mjs';

const fictional = {
  owner: 'Example Candidate',
  profile: {education: {degree: 'Example degree'}},
  entities: [
    {id: 'garden', name: 'Community garden', tags: ['general'], aliases: ['garden planning']},
    {id: 'warehouse', name: 'Warehouse tools', tags: ['software'], aliases: ['stock checker']},
    {id: 'robot', name: 'Robot controller', tags: ['embedded', 'hardware']}
  ],
  claims: [
    {id: 'api', entity_id: 'warehouse', text: 'Built a Python API with request validation and integration tests.'},
    {id: 'firmware', entity_id: 'robot', text: 'Implemented a motor controller and bench tests.'}
  ], metrics: [], skills: [], coursework: []
};

test('fresh download creates an empty local profile and never needs a pre-existing database', async t => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'notes-fresh-'));
  t.after(() => rm(runtime, {recursive: true, force: true}));
  const app = await createApp({port: 0, runtime, key: ''});
  t.after(() => app.close());
  const config = await (await fetch(app.url + '/api/config')).json();
  const library = await (await fetch(app.url + '/api/library')).json();
  assert.equal(config.app, 'interview-notes');
  assert.equal(config.keyConfigured, false);
  assert.deepEqual(library.experiences, []);
  assert.equal(config.settings.company, '');
  assert.equal(config.databasePath, path.join(runtime, 'experience.json'));
  const db = JSON.parse(await readFile(config.databasePath, 'utf8'));
  assert.deepEqual(db.entities, []);
  assert.deepEqual(db.claims, []);
});

test('personalized retrieval and ranking follow the supplied profile, including custom aliases', () => {
  const library = buildLibrary(fictional);
  assert.equal(explicitExperiences(library, 'Explain the stock checker')[0]?.id, 'warehouse');
  assert.equal(buildBrief(library, {role: 'Software Engineer'}).stories[0].id, 'warehouse');
  assert.equal(buildBrief(library, {role: 'Firmware Engineer'}).stories[0].id, 'robot');
  assert.equal(retrieve(buildCorpus(fictional), 'Python API validation')[0].entity, 'warehouse');
});

test('prompts do not prescribe citizenship, clearance, or an identity', () => {
  const prompt = buildPrompt({facts: [], question: 'What citizenship do you hold?', profile: '', settings: {}});
  assert.doesNotMatch(prompt.instructions, /On clearance, state no clearance/);
  assert.match(prompt.instructions, /citizenship.*(?:supplied|recorded)|(?:supplied|recorded).*citizenship/);
  assert.equal(JSON.parse(prompt.input).candidate_education, '');
});

test('recorded logistics can be retrieved without inferring them from the job', () => {
  const corpus = buildCorpus({profile: {logistics: {location_preferences: 'Remote only', availability: 'September'}}});
  assert.match(retrieve(corpus, 'What are your location preferences?')[0].text, /Remote only/);
});

test('an explicitly supplied missing database is reported rather than silently replaced', async t => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'notes-missing-'));
  t.after(() => rm(runtime, {recursive: true, force: true}));
  await assert.rejects(createApp({port: 0, runtime, key: '', databasePath: path.join(runtime, 'missing.json')}), /database|ENOENT/i);
});

test('custom experience reaches answers; source files and unauthenticated writes stay private', async t => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'notes-private-'));
  t.after(() => rm(runtime, {recursive: true, force: true}));
  const requests = [];
  const app = await createApp({port: 0, runtime, key: 'mock', database: fictional,
    answerStream: async function*(request) {requests.push(request); yield {type: 'delta', text: 'Example generated notes.'};}
  });
  t.after(() => app.close());
  const config = await (await fetch(app.url + '/api/config')).json();
  const headers = {'Content-Type': 'application/json', Origin: app.url, 'X-App-Token': config.token};
  const response = await fetch(app.url + '/api/answer', {method: 'POST', headers, body: JSON.stringify({question: 'How did you validate the stock checker API?'})});
  assert.match(await response.text(), /Example generated notes/);
  assert.match(requests[0].prompt.input, /request validation and integration tests/);
  assert.equal((await fetch(app.url + '/.runtime/experience.json')).status, 404);
  assert.equal((await fetch(app.url + '/api/settings', {method: 'POST', body: '{}'})).status, 403);
  assert.equal((await fetch(app.url + '/api/key', {method: 'POST', headers, body: JSON.stringify({key: 'invalid'})})).status, 400);
});
