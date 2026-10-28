#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const MIGRATION_ID_PATTERN = /^[0-9]{4,12}_[a-z][a-z0-9_]*$/;

function fail(message) {
  console.error(message);
  process.exit(2);
}

function canonicalSql(sql) {
  return `${sql.replaceAll('\r\n', '\n').replaceAll('\r', '\n').trimEnd()}\n`;
}

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const apiUrl = process.env.BUILDER_API_URL;
const projectId = process.env.BUILDER_PROJECT_ID;
const token = process.env.BUILDER_PROJECT_TOKEN;
if (!apiUrl || !projectId || !token) {
  fail(
    'BUILDER_API_URL / BUILDER_PROJECT_ID / BUILDER_PROJECT_TOKEN missing: ' +
    'this script only runs inside a builder-started process.',
  );
}

const [migrationId, sqlFile, ...extra] = process.argv.slice(2);
if (!migrationId || !MIGRATION_ID_PATTERN.test(migrationId) || extra.length > 0) {
  fail(
    'Usage: node scripts/migrate-project.mjs <0002_migration_name> [sql-file]\n' +
    '       echo "ALTER TABLE ..." | node scripts/migrate-project.mjs <0002_migration_name>',
  );
}

const rawSql = sqlFile ? await readFile(resolve(sqlFile), 'utf8') : await readStdin();
const sql = canonicalSql(rawSql);
if (!sql.trim()) fail('Migration SQL cannot be empty.');

const migrationsDir = resolve('migrations');
const pendingDir = resolve(migrationsDir, '.pending');
const pendingPath = resolve(pendingDir, `${migrationId}.sql`);
const finalPath = resolve(migrationsDir, `${migrationId}.sql`);
await mkdir(pendingDir, { recursive: true });

let finalExists = false;
try {
  const existing = canonicalSql(await readFile(finalPath, 'utf8'));
  finalExists = true;
  if (existing !== sql) {
    fail(`Applied migration ${migrationId} already exists with different SQL.`);
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

// A pending file holding different SQL is overwritten: the platform decides whether that migration may
// take corrected SQL (it failed and was never applied). When it answers 409, the old SQL is written back.
let previousPending = null;
async function restorePending() {
  if (previousPending === null) return false;
  await writeFile(pendingPath, previousPending, 'utf8');
  return true;
}
if (!finalExists) {
  try {
    await writeFile(pendingPath, sql, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const existing = await readFile(pendingPath, 'utf8');
    if (canonicalSql(existing) !== sql) {
      previousPending = existing;
      await writeFile(pendingPath, sql, 'utf8');
    }
  }
}

const migrationChecksum = checksum(sql);
const url = `${apiUrl.replace(/\/+$/, '')}/api/projects/${projectId}/schema-migrations/apply`;
let response;
try {
  response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workspace-token': token,
      'x-project-token': token,
    },
    body: JSON.stringify({ migrationId, checksum: migrationChecksum }),
  });
} catch (error) {
  // No answer: the platform may still have promoted this SQL into migrations/, so the file is not touched again.
  console.error(
    `Migration admission failed (${error?.message ?? error}); ` +
    `pending source was retained at migrations/.pending/${migrationId}.sql.`,
  );
  process.exit(1);
}
const responseText = await response.text();
let body;
try {
  body = JSON.parse(responseText);
} catch {
  body = { raw: responseText };
}

if (!response.ok || !body.ok) {
  // 409: the platform keeps the SQL it already holds (applied, pending or applying), so the file goes back too.
  const restored = response.status === 409 && (await restorePending());
  console.error(
    `Migration admission failed (${response.status}); ` +
    (restored
      ? `the previous pending SQL was restored at migrations/.pending/${migrationId}.sql.`
      : `pending source was retained at migrations/.pending/${migrationId}.sql.`),
  );
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`Applied ${migrationId} (${migrationChecksum}).`);
