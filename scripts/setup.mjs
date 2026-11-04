import {mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {emptyExperience} from '../src/data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, '.runtime');
await mkdir(runtime, {recursive: true, mode: 0o700});
const filename = path.join(runtime, 'experience.json');
try {
  await writeFile(filename, JSON.stringify(emptyExperience(), null, 2) + '\n', {flag: 'wx', mode: 0o600});
  console.log('Created an empty private profile in .runtime/experience.json.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('Kept your existing .runtime/experience.json unchanged.');
}
console.log('Use examples/experience.example.json as a guide to enter your own background.');
console.log('Run npm start, then open http://127.0.0.1:4319 and choose Setup.');
console.log('Add your own OpenAI API key. Never put it in your experience file.');
