#!/usr/bin/env node
// Run DML/SELECT against this project's Supabase schema without opening the
// Supabase SQL Editor.
//
// Usage:
//   echo "INSERT INTO products (name) VALUES ('rose');" | npm run sql
//   npm run sql -- "SELECT 1"
//
// The builder server wraps the statement in BEGIN/COMMIT with
// SET LOCAL search_path TO <this project's schema>, so an unqualified table name
// DDL belongs in immutable migrations via `npm run migrate`; dangerous and
// cross-schema statements are rejected by the server.
//
// Auth: the platform injects a project-scoped, expiring credential as
// BUILDER_PROJECT_TOKEN when it starts the container, so no user cookie is
// involved. The server accepts it under either header; this script sends both.

const apiUrl = process.env.BUILDER_API_URL;
const projectId = process.env.BUILDER_PROJECT_ID;
const token = process.env.BUILDER_PROJECT_TOKEN;

if (!apiUrl || !projectId || !token) {
  console.error(
    'BUILDER_API_URL / BUILDER_PROJECT_ID / BUILDER_PROJECT_TOKEN missing: this script only runs inside a builder-started process.',
  );
  process.exit(2);
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const argSql = process.argv.slice(2).join(' ').trim();
const sql = argSql || (await readStdin()).trim();
if (!sql) {
  console.error('Usage: echo "INSERT INTO ..." | npm run sql   or   npm run sql -- "SELECT 1"');
  process.exit(2);
}

const url = `${apiUrl.replace(/\/+$/, '')}/api/projects/${projectId}/exec-sql`;
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-workspace-token': token,
    'x-project-token': token,
  },
  body: JSON.stringify({ sql }),
});

const text = await res.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text }; }

// Render result rows as an aligned table. This is for the agent to read, and a
// table is easier to scan than JSON.
// One long value would widen the whole column and burn the agent's context for
// nothing, so anything past the cap is truncated with an ellipsis.
const MAX_CELL_LEN = 60;
function printTable(rows, fields) {
  const columns = fields?.length ? fields.map((f) => f.name) : Object.keys(rows[0]);
  const cell = (value) => {
    const s =
      value === null || value === undefined ? 'NULL'
      : typeof value === 'object' ? JSON.stringify(value)
      : String(value);
    return s.length > MAX_CELL_LEN ? `${s.slice(0, MAX_CELL_LEN - 1)}…` : s;
  };
  const widths = columns.map((c) =>
    Math.max(c.length, ...rows.map((r) => cell(r[c]).length)),
  );
  const line = (values) =>
    values.map((v, i) => v.padEnd(widths[i])).join('  ').trimEnd();
  console.log(line(columns));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const row of rows) console.log(line(columns.map((c) => cell(row[c]))));
}

if (res.ok && body.ok) {
  if (Array.isArray(body.rows) && body.rows.length > 0) {
    printTable(body.rows, body.fields);
    console.log(`(${body.rows.length} rows${body.truncated ? ', truncated' : ''})`);
  } else {
    console.log(`ok (rowCount=${body.rowCount ?? 0})`);
  }
  process.exit(0);
}

console.error(`failed (${res.status}):`, JSON.stringify(body, null, 2));
process.exit(1);
