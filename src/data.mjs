import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

export const emptyExperience = () => ({
  owner: 'Candidate', profile: {education: {}},
  entities: [], claims: [], metrics: [], skills: [], coursework: []
});

export function validateExperience(db) {
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw new Error('Experience database must be a JSON object.');
  for (const key of ['entities', 'claims', 'metrics', 'skills', 'coursework']) {
    if (db[key] !== undefined && (!Array.isArray(db[key]) || db[key].some(v => !v || typeof v !== 'object' || Array.isArray(v)))) {
      throw new Error(`Experience database: ${key} must be an array of objects.`);
    }
  }
  const ids = new Set();
  for (const entity of db.entities || []) {
    if (typeof entity.id !== 'string' || !entity.id.trim() || ids.has(entity.id)) throw new Error('Experience entities need unique, nonempty string IDs.');
    ids.add(entity.id);
    for (const key of ['aliases', 'tags', 'role_tags']) {
      if (entity[key] !== undefined && (!Array.isArray(entity[key]) || entity[key].some(v => typeof v !== 'string'))) throw new Error(`Entity ${entity.id}: ${key} must be an array of strings.`);
    }
  }
  return db;
}

export async function loadExperience({runtime, database, databasePath}) {
  const explicit = !!databasePath;
  databasePath ||= path.join(runtime, 'experience.json');
  if (database) return {database: validateExperience(database), databasePath};
  let value;
  try {
    value = JSON.parse(await readFile(databasePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' || explicit) throw new Error(`Cannot read experience database ${databasePath}: ${error.message}`);
    await mkdir(runtime, {recursive: true, mode: 0o700});
    value = emptyExperience();
    try {
      await writeFile(databasePath, JSON.stringify(value, null, 2) + '\n', {flag: 'wx', mode: 0o600});
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      value = JSON.parse(await readFile(databasePath, 'utf8'));
    }
  }
  return {database: validateExperience(value), databasePath};
}
