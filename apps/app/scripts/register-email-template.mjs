#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Sync every template in emails/ to the platform. Whole-set replace: a template
 * deleted from this directory is deleted on the platform too, which is why this
 * takes no arguments — the directory is the source of truth.
 *
 * Each template is a pair: <id>.html (the body) and <id>.json (subject + slot
 * declarations). The platform re-validates everything; this script only collects.
 */

function fail(message) {
  console.error(message);
  process.exit(2);
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

if (process.argv.slice(2).length > 0) {
  fail('Usage: npm run email:template   (no arguments — it syncs the whole emails/ directory)');
}

const emailsDir = resolve('emails');
let entries;
try {
  entries = await readdir(emailsDir);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  fail('No emails/ directory. Create emails/<id>.html and emails/<id>.json first.');
}

const ids = entries.filter((name) => name.endsWith('.html')).map((name) => name.slice(0, -'.html'.length)).sort();

const templates = [];
for (const templateId of ids) {
  const html = await readFile(resolve(emailsDir, `${templateId}.html`), 'utf8');
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(emailsDir, `${templateId}.json`), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') fail(`emails/${templateId}.json is missing (every template needs one).`);
    fail(`emails/${templateId}.json is not valid JSON: ${error.message}`);
  }
  templates.push({ templateId, html, manifest });
}

const url = `${apiUrl.replace(/\/+$/, '')}/api/projects/${projectId}/email-templates`;
const response = await fetch(url, {
  method: 'PUT',
  headers: {
    'content-type': 'application/json',
    'x-workspace-token': token,
    'x-project-token': token,
  },
  body: JSON.stringify({ templates }),
});
const responseText = await response.text();
let body;
try {
  body = JSON.parse(responseText);
} catch {
  body = { raw: responseText };
}

if (!response.ok || !body.ok) {
  console.error(`Template sync failed (${response.status}). Nothing was changed on the platform.`);
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

// An empty emails/ directory is a deliberate whole-set sync too: it means
// "remove every template this project has registered," not an error — the
// platform's replaceEmailTemplates already supports deleting down to zero.
console.log(
  ids.length === 0
    ? 'emails/ is empty — removed all templates from the platform.'
    : `Synced ${body.count} template(s): ${ids.join(', ')}`,
);
