/**
 * The mechanical half of the pre-launch security checklist (docs/09).
 *
 *   npm run verify:security
 *
 * These are the items a script can settle: RLS on every table, search_path set
 * and public execute revoked on every security-definer function, and no write
 * reachable by an anonymous caller. It uses the service role to ask the
 * catalogue what is true, and the anon key to try the writes for real — asking
 * Postgres what it would allow is not the same as being told no.
 *
 * The rest of the checklist is human: SMTP tested on a real phone, the service
 * role key living only in Actions secrets, the crons actually running.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const URL_BASE = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !ANON || !SERVICE) {
  console.error('Needs EXPO_PUBLIC_SUPABASE_URL, the anon key and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (!ok && detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}

/** The catalogue, read as service_role through a helper view-free RPC-free path. */
async function sql(query) {
  const r = await fetch(URL_BASE + '/rest/v1/rpc/' + query.fn, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      Authorization: 'Bearer ' + SERVICE,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(query.args ?? {}),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

console.log('\nAnonymous writes\n');

// Every table that exists, tried for real with the anon key. A table that
// accepts an anonymous insert is the failure this whole section is about.
const TABLES = [
  'profiles',
  'experiences',
  'experience_aliases',
  'kreamis',
  'follows',
  'likes',
  'replies',
  'notifications',
  'reports',
  'suggested_profiles',
  'reserved_handles',
  'rate_limit_events',
  'experience_resolution_log',
];

for (const table of TABLES) {
  const r = await fetch(URL_BASE + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: 'Bearer ' + ANON,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({}),
  });
  check(`anon cannot insert into ${table}`, r.status >= 400, 'HTTP ' + r.status);
}

console.log('\nAnonymous reads that must work — the funnel\n');

for (const [name, query] of [
  ['global_feed', 'rpc/global_feed'],
  ['active_experiences', 'rpc/active_experiences'],
]) {
  const r = await fetch(URL_BASE + '/rest/v1/' + query, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
    body: '{}',
  });
  check(`anon can read ${name}`, r.status === 200, 'HTTP ' + r.status);
}

const slug = await fetch(URL_BASE + '/rest/v1/rpc/get_experience_by_slug', {
  method: 'POST',
  headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ s: 'nothing-here' }),
});
check('anon can resolve a shared /e/:slug link', slug.status === 200, 'HTTP ' + slug.status);

console.log('\nThe catalogue\n');

const audit = await sql({ fn: 'security_audit' });
const rows = Array.isArray(audit.body) ? audit.body : [];
check(
  'security_audit() is callable as service_role',
  audit.status === 200,
  JSON.stringify(audit.body).slice(0, 160),
);

for (const row of rows) {
  check(row.finding, row.count === 0, row.detail ?? String(row.count));
}

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
