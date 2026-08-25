/**
 * Runs every query the app makes that a logged-out visitor can reach, against
 * the real dev project, and fails on anything that is not a 200.
 *
 *   npm run smoke
 *
 * This exists because of a bug that shipped: adding the `likes` table created a
 * second relationship path from kreamis to profiles, so the experience thread's
 * embed became ambiguous and PostgREST answered HTTP 300. Typecheck, lint and
 * the web build all passed — the query is a string, and nothing checks strings
 * against a live schema. This does.
 *
 * It is deliberately not part of `npm run check`: it needs the network and
 * .env.local, neither of which CI has. Run it after any schema change.
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
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

let failures = 0;

async function rest(name, query) {
  const r = await fetch(URL_BASE + '/rest/v1/' + query, { headers: H });
  const body = await r.text();
  const ok = r.status === 200;
  if (!ok) failures++;
  console.log(
    (ok ? '  PASS  ' : '  FAIL  ') +
      name +
      (ok ? '' : '  — HTTP ' + r.status + ' ' + body.slice(0, 160)),
  );
  return ok ? JSON.parse(body) : null;
}

async function rpc(name, fn, args) {
  const r = await fetch(URL_BASE + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(args ?? {}),
  });
  const body = await r.text();
  const ok = r.status === 200;
  if (!ok) failures++;
  console.log(
    (ok ? '  PASS  ' : '  FAIL  ') +
      name +
      (ok ? '' : '  — HTTP ' + r.status + ' ' + body.slice(0, 160)),
  );
  return ok ? JSON.parse(body) : null;
}

console.log('Discovery — everything a logged-out visitor sees\n');
const feed = await rpc('global_feed', 'global_feed', { lim: 5 });
await rpc('active_experiences', 'active_experiences', { lim: 5 });
await rpc('search_experiences', 'search_experiences', { q: 'a', lim: 5 });

console.log('\nPeople search (Discover)\n');
await rest(
  'profiles ilike search',
  'profiles?select=id,handle,display_name&handle=not.is.null&or=(handle.ilike.%25a%25,display_name.ilike.%25a%25)&limit=5',
);

// Anything the feed actually returned gets followed through the app's own path,
// so the checks exercise real ids rather than a synthetic happy path.
const sample = Array.isArray(feed) && feed.length > 0 ? feed[0] : null;

if (sample) {
  console.log('\nExperience thread — using ' + JSON.stringify(sample.experience_slug) + '\n');
  await rpc('get_experience_by_slug', 'get_experience_by_slug', { s: sample.experience_slug });
  await rpc('experience_distribution', 'experience_distribution', {
    target: sample.experience_id,
  });
  // The query that broke. The FK must be named or PostgREST returns 300.
  await rest(
    'thread with author embed',
    'kreamis?select=id,rating,note,created_at,like_count,reply_count,profiles!kreamis_user_id_fkey(handle,display_name,avatar_url)&experience_id=eq.' +
      sample.experience_id +
      '&order=created_at.desc&limit=50',
  );

  if (sample.handle) {
    console.log('\nProfile — using @' + sample.handle + '\n');
    const profile = await rpc('public_profile', 'public_profile', {
      target_handle: sample.handle,
    });
    const row = Array.isArray(profile) ? profile[0] : profile;
    if (row) {
      for (const sort of ['recent', 'highest', 'lowest']) {
        await rpc('profile_kreamis (' + sort + ')', 'profile_kreamis', {
          target: row.id,
          sort,
          lim: 10,
        });
      }
    }
  }
} else {
  console.log('\n  (no Kreamis yet — thread and profile queries skipped)');
}

console.log(
  '\n' + (failures ? failures + ' QUERY/QUERIES FAILED' : 'all app queries returned 200'),
);
process.exit(failures ? 1 : 0);
