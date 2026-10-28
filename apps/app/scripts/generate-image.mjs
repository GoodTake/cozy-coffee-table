#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

/**
 * One image from the platform's image model, written into this App. Each image is charged to the
 * owner's platform balance; a failed one is not. See /workspace/.skills/skills-generate-image/SKILL.md.
 */

const USAGE = 'Usage: node scripts/generate-image.mjs --out <file.jpg|.png|.webp> --aspect <9:16|3:4|1:1|16:9> [--ref <image>]... "<prompt>"';
const FORMATS = { '.jpg': 'jpeg', '.jpeg': 'jpeg', '.png': 'png', '.webp': 'webp' };

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

const apiUrl = process.env.BUILDER_API_URL;
const projectId = process.env.BUILDER_PROJECT_ID;
const token = process.env.BUILDER_PROJECT_TOKEN;
if (!apiUrl || !projectId || !token) {
  fail('BUILDER_API_URL / BUILDER_PROJECT_ID / BUILDER_PROJECT_TOKEN missing: this script only runs inside a builder-started process.');
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, aspect: { type: 'string' }, ref: { type: 'string', multiple: true } },
  });
} catch (error) {
  fail(`${error.message}\n${USAGE}`);
}
const { values, positionals } = parsed;
const prompt = positionals.join(' ').trim();
if (!values.out || !values.aspect || !prompt) fail(USAGE);
const format = FORMATS[extname(values.out).toLowerCase()];
if (!format) fail(`--out must end in .jpg, .jpeg, .png or .webp: ${values.out}`);

const references = [];
for (const ref of values.ref ?? []) {
  try {
    references.push((await readFile(resolve(ref))).toString('base64'));
  } catch (error) {
    fail(`Cannot read --ref ${ref}: ${error.message}`);
  }
}

const response = await fetch(`${apiUrl.replace(/\/+$/, '')}/api/projects/${projectId}/builder/images`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-workspace-token': token },
  body: JSON.stringify({ prompt, aspect: values.aspect, format, references }),
});
const text = await response.text();
let body;
try {
  body = JSON.parse(text);
} catch {
  body = { raw: text };
}
if (!response.ok || !body?.image?.b64) {
  const code = body?.error?.code ?? `http_${response.status}`;
  fail(`Image not generated (${code}): ${body?.error?.message ?? text}`, 1);
}

const out = resolve(values.out);
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.from(body.image.b64, 'base64'));
console.log(JSON.stringify({
  out: values.out, width: body.image.width, height: body.image.height, chargedSsu: body.chargedSsu, model: body.model,
}));
