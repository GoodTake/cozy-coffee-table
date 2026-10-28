#!/usr/bin/env node
// Run one of this App's scheduled tasks right now, on the development backend, without waiting for its schedule.
//
// Usage:
//   npm run task -- <name>
//
// <name> is a task declared in functions/schedules.json. The platform reads that file from your working tree as it is
// now, then sends the task's path to the dev backend the way a scheduled call would (POST, no body, with the
// x-steps-scheduled-task and x-steps-scheduled-for headers). Nothing runs on its own in development: this is the way to
// try a task. Run it with the dev backend deployed (POST $BUILDER_API_URL/api/projects/$BUILDER_PROJECT_ID/backend/deploy).
//
// Prints the task's HTTP status, how long it took, and the start of its answer. Exits 1 when the platform refuses the
// run or when the task answers anything but 2xx.
//
// Auth: the platform injects a project-scoped, expiring credential as BUILDER_PROJECT_TOKEN when it starts the
// container, so no user cookie is involved.

const apiUrl = process.env.BUILDER_API_URL;
const projectId = process.env.BUILDER_PROJECT_ID;
const token = process.env.BUILDER_PROJECT_TOKEN;

if (!apiUrl || !projectId || !token) {
  console.error(
    'BUILDER_API_URL / BUILDER_PROJECT_ID / BUILDER_PROJECT_TOKEN missing: this script only runs inside a builder-started process.',
  );
  process.exit(2);
}

const name = process.argv[2]?.trim();
if (!name) {
  console.error('Usage: npm run task -- <name>   (a task name from functions/schedules.json)');
  process.exit(2);
}

const url = `${apiUrl.replace(/\/+$/, '')}/api/projects/${projectId}/scheduled-tasks/${encodeURIComponent(name)}/run`;
const res = await fetch(url, { method: 'POST', headers: { 'x-workspace-token': token } });

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text }; }

if (!res.ok) {
  console.error(`failed (${res.status}):`, JSON.stringify(body, null, 2));
  process.exit(1);
}

console.log(`status: ${body.status}`);
console.log(`durationMs: ${body.durationMs}`);
if (body.body) console.log(body.body);
if (body.truncated) console.log('(truncated)');
process.exit(body.status >= 200 && body.status < 300 ? 0 : 1);
