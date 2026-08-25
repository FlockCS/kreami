/**
 * End-to-end verification of the authenticated flows, using two throwaway
 * accounts against the dev project.
 *
 *   npm run e2e
 *
 * Everything here runs as a normal signed-in user through the same RPCs the app
 * calls — no service role, so anything that passes here is genuinely reachable
 * by a real person, and anything RLS forbids fails here too.
 *
 * Both accounts and everything they created are deleted at the end, including
 * on failure. Cleanup is the one place the service-role key is used: deleting
 * an account cascades its Kreamis but NOT the experiences it created, because
 * experiences.created_by is `on delete set null` — an experience outlives the
 * person who first rated it, which is right for the product and wrong for a
 * test that must leave nothing behind.
 *
 * Requires the dev project to allow sign-up without email confirmation.
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

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (!ok && detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}

function headers(token) {
  return {
    apikey: ANON,
    Authorization: 'Bearer ' + (token ?? ANON),
    'Content-Type': 'application/json',
  };
}

async function rpc(token, fn, args) {
  const r = await fetch(URL_BASE + '/rest/v1/rpc/' + fn, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(args ?? {}),
  });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

async function rest(token, query) {
  const r = await fetch(URL_BASE + '/rest/v1/' + query, { headers: headers(token) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

/** A 1x1 PNG — small enough to be a literal, real enough for the bucket to accept it. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function putAvatar(token, objectPath, contentType = 'image/png', body = PIXEL) {
  return fetch(URL_BASE + '/storage/v1/object/avatars/' + objectPath, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: 'Bearer ' + (token ?? ANON),
      'Content-Type': contentType,
    },
    body,
  });
}

async function makeUser(nick) {
  const email = `kreami+${nick}-${Date.now()}@example.com`;
  const r = await fetch(URL_BASE + '/auth/v1/signup', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: `pw-${nick}-772913`,
      data: { full_name: nick[0].toUpperCase() + nick.slice(1) },
    }),
  });
  const body = await r.json();
  if (!body.access_token) {
    console.error(
      'Could not create a session for ' +
        nick +
        '. Email confirmation may still be on.\n' +
        JSON.stringify(body).slice(0, 200),
    );
    process.exit(2);
  }
  return { token: body.access_token, id: body.user.id, email };
}

const created = [];
const experiences = new Set();

async function cleanup() {
  for (const u of created) {
    await rpc(u.token, 'delete_account', {});
  }
  if (!SERVICE) {
    console.log('  no service-role key: experiences created by this run were left behind');
    return;
  }
  for (const id of experiences) {
    await fetch(URL_BASE + '/rest/v1/experiences?id=eq.' + id, {
      method: 'DELETE',
      headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, Prefer: 'return=minimal' },
    });
  }
}

try {
  console.log('Setting up two accounts\n');
  const alice = await makeUser('alice');
  const bob = await makeUser('bob');
  created.push(alice, bob);

  const suffix = String(Date.now()).slice(-6);
  const aliceHandle = `zz_a${suffix}`;
  const bobHandle = `zz_b${suffix}`;

  let r = await rpc(alice.token, 'claim_handle', { new_handle: aliceHandle });
  check(
    'alice claims a handle',
    r.status === 200 && r.body === aliceHandle,
    JSON.stringify(r.body),
  );
  r = await rpc(bob.token, 'claim_handle', { new_handle: bobHandle });
  check('bob claims a handle', r.status === 200, JSON.stringify(r.body));

  r = await rpc(bob.token, 'claim_handle', { new_handle: aliceHandle });
  check("bob cannot take alice's handle", r.status >= 400, JSON.stringify(r.body));

  console.log('\nThe matching rule\n');
  const title = `Queueing at ${suffix} in the rain`;
  r = await rpc(alice.token, 'post_kreami', {
    raw_title: title,
    rating: 4,
    note: 'Damp but fair.',
  });
  const first = Array.isArray(r.body) ? r.body[0] : r.body;
  check(
    'alice posts a Kreami',
    r.status === 200 && Boolean(first?.experience_id),
    JSON.stringify(r.body),
  );
  if (first?.experience_id) experiences.add(first.experience_id);
  check('it was a create, not an edit', first?.was_edit === false);

  // Same words, different case — must land on the same experience.
  r = await rpc(bob.token, 'post_kreami', {
    raw_title: title.toUpperCase(),
    rating: 1,
    note: 'Soaked.',
  });
  const second = Array.isArray(r.body) ? r.body[0] : r.body;
  check(
    'different case joins the SAME experience',
    second?.experience_id === first?.experience_id,
    `${first?.experience_id} vs ${second?.experience_id}`,
  );

  // Punctuation is a visible character, so it splits. Accepted cost of D4.
  r = await rpc(bob.token, 'post_kreami', { raw_title: title + '!', rating: 5 });
  const third = Array.isArray(r.body) ? r.body[0] : r.body;
  check(
    'trailing punctuation makes a SEPARATE experience (D4)',
    third?.experience_id && third.experience_id !== first?.experience_id,
  );
  if (third?.experience_id) experiences.add(third.experience_id);

  // Both titles slugify identically once punctuation is stripped, so this is
  // also the only exercise the slug-collision retry loop ever gets.
  r = await rest(
    alice.token,
    `experiences?select=slug&id=in.(${first.experience_id},${third.experience_id})&order=created_at.asc`,
  );
  const slugs = (r.body ?? []).map((e) => e.slug);
  check(
    'colliding slugs get a numbered suffix',
    slugs.length === 2 && slugs[1] === slugs[0] + '-2',
    JSON.stringify(slugs),
  );

  // Re-posting on an experience you already rated edits rather than duplicating.
  r = await rpc(alice.token, 'post_kreami', { raw_title: title, rating: 2, note: 'Downgraded.' });
  const edit = Array.isArray(r.body) ? r.body[0] : r.body;
  check('re-posting edits instead of duplicating', edit?.was_edit === true);
  check('the edit stayed on the same experience', edit?.experience_id === first?.experience_id);

  r = await rest(
    alice.token,
    `experiences?select=kreami_count,rating_sum&id=eq.${first.experience_id}`,
  );
  const exp = r.body?.[0];
  check(
    'counters reflect the edit (2 Kreamis, 2 + 1 = 3)',
    exp?.kreami_count === 2 && exp?.rating_sum === 3,
    JSON.stringify(exp),
  );

  console.log('\nThe follow graph\n');
  r = await rpc(bob.token, 'toggle_follow', { target: alice.id });
  let follow = Array.isArray(r.body) ? r.body[0] : r.body;
  check('bob follows alice', follow?.following === true, JSON.stringify(r.body));
  check('follower_count incremented', follow?.follower_count === 1);

  r = await rpc(alice.token, 'toggle_follow', { target: alice.id });
  check('nobody can follow themselves', r.status >= 400);

  r = await rpc(bob.token, 'home_feed', { lim: 20 });
  const feed = Array.isArray(r.body) ? r.body : [];
  check(
    "bob's home feed contains alice's Kreami",
    feed.some((f) => f.user_id === alice.id),
    `${feed.length} items`,
  );
  check(
    "bob's home feed contains his own",
    feed.some((f) => f.user_id === bob.id),
  );

  console.log('\nFollower and following lists\n');
  r = await rpc(alice.token, 'profile_followers', { target: alice.id });
  const aliceFollowers = Array.isArray(r.body) ? r.body : [];
  const bobRow = aliceFollowers.find((p) => p.id === bob.id);
  check("alice's followers contains bob", Boolean(bobRow), JSON.stringify(r.body).slice(0, 200));
  check('the row carries a cursor', typeof bobRow?.followed_at === 'string');
  check('alice does not follow bob back, and the row says so', bobRow?.is_following === false);
  check('bob is not alice', bobRow?.is_self === false);

  r = await rpc(bob.token, 'profile_following', { target: bob.id });
  const bobFollowing = Array.isArray(r.body) ? r.body : [];
  const aliceRow = bobFollowing.find((p) => p.id === alice.id);
  check("bob's following contains alice", Boolean(aliceRow), JSON.stringify(r.body).slice(0, 200));
  check('and it is marked as one bob follows', aliceRow?.is_following === true);

  // Same list, viewed by the other person: is_following is per-viewer, so
  // alice looking at her own follower list must not see herself as followed.
  r = await rpc(alice.token, 'profile_following', { target: bob.id });
  const asAlice = (Array.isArray(r.body) ? r.body : []).find((p) => p.id === alice.id);
  check('is_following is per-viewer, not per-row', asAlice?.is_following === false);
  check('and is_self is true when you appear in a list', asAlice?.is_self === true);

  // The lists are the one profile surface a logged-out visitor lands on from
  // a shared link, so they must work without a session.
  r = await rpc(null, 'profile_followers', { target: alice.id });
  const anon = Array.isArray(r.body) ? r.body : [];
  check(
    'anonymous visitors can read a follower list',
    anon.some((p) => p.id === bob.id),
  );
  check(
    'and follow nobody',
    anon.every((p) => p.is_following === false && p.is_self === false),
  );

  // First real exercise of a keyset cursor: pointed at the only edge there is,
  // the next page must be empty rather than repeating it.
  r = await rpc(alice.token, 'profile_followers', {
    target: alice.id,
    before: bobRow?.followed_at,
  });
  check(
    'the before cursor excludes the row it points at',
    Array.isArray(r.body) && r.body.length === 0,
    JSON.stringify(r.body).slice(0, 120),
  );

  r = await rpc(bob.token, 'profile_following', { target: alice.id });
  check(
    'alice follows nobody, so her following list is empty',
    Array.isArray(r.body) && r.body.length === 0,
    JSON.stringify(r.body).slice(0, 120),
  );

  console.log('\nLikes, and replies staying closed\n');
  r = await rpc(bob.token, 'toggle_like', { target: edit.kreami_id });
  let like = Array.isArray(r.body) ? r.body[0] : r.body;
  check('bob likes it', like?.liked === true && like?.like_count === 1, JSON.stringify(r.body));

  r = await rpc(bob.token, 'toggle_like', { target: edit.kreami_id });
  like = Array.isArray(r.body) ? r.body[0] : r.body;
  check(
    'liking again unlikes (idempotent toggle)',
    like?.liked === false && like?.like_count === 0,
  );

  // Replies are deferred from v1 (D18). The table, trigger and post_reply()
  // still exist and still work; the grant is what was withdrawn. This asserts
  // the closure holds, so nobody can write rows into a surface with no reader.
  r = await rpc(bob.token, 'post_reply', { target: edit.kreami_id, body: 'Harsh.' });
  check('replies are closed (D18)', r.status >= 400, 'HTTP ' + r.status);

  r = await rest(alice.token, `kreamis?select=reply_count&id=eq.${edit.kreami_id}`);
  check('reply_count stayed at zero', r.body?.[0]?.reply_count === 0, JSON.stringify(r.body));

  r = await fetch(URL_BASE + '/rest/v1/replies', {
    method: 'POST',
    headers: { ...headers(bob.token), Prefer: 'return=minimal' },
    body: JSON.stringify({ kreami_id: edit.kreami_id, user_id: bob.id, body: 'direct' }),
  });
  check('nor can a reply be inserted directly', r.status >= 400, 'HTTP ' + r.status);

  console.log('\nThe avatar bucket\n');
  r = await putAvatar(alice.token, `${alice.id}/mine.png`);
  check('you can write into your own folder', r.status < 400, 'HTTP ' + r.status);

  const avatarUrl = `${URL_BASE}/storage/v1/object/public/avatars/${alice.id}/mine.png`;
  r = await fetch(avatarUrl);
  check('and anyone can read it back, signed in or not', r.status === 200, 'HTTP ' + r.status);

  // The whole authorisation rule is the first path segment, so these are the
  // checks that matter: a folder you do not own, and no folder at all.
  r = await putAvatar(bob.token, `${alice.id}/stolen.png`);
  check("cannot write into somebody else's folder", r.status >= 400, 'HTTP ' + r.status);

  r = await putAvatar(alice.token, 'loose.png');
  check('cannot write to the bucket root', r.status >= 400, 'HTTP ' + r.status);

  r = await putAvatar(null, `${alice.id}/anon.png`);
  check('anonymous callers cannot upload at all', r.status >= 400, 'HTTP ' + r.status);

  r = await fetch(URL_BASE + `/storage/v1/object/avatars/${alice.id}/mine.png`, {
    method: 'DELETE',
    headers: { apikey: ANON, Authorization: 'Bearer ' + bob.token },
  });
  check("cannot delete somebody else's photo", r.status >= 400, 'HTTP ' + r.status);

  // The two bucket-level limits. The client resizes to 256x256 before it
  // uploads; these are what stands between a client bug and the free tier.
  r = await putAvatar(
    alice.token,
    `${alice.id}/big.jpg`,
    'image/jpeg',
    Buffer.alloc(300 * 1024, 1),
  );
  check('the 256 KB ceiling is enforced', r.status >= 400, 'HTTP ' + r.status);

  r = await putAvatar(alice.token, `${alice.id}/evil.html`, 'text/html', Buffer.from('<b>no</b>'));
  check('non-image content types are rejected', r.status >= 400, 'HTTP ' + r.status);

  r = await fetch(URL_BASE + `/storage/v1/object/avatars/${alice.id}/mine.png`, {
    method: 'DELETE',
    headers: { apikey: ANON, Authorization: 'Bearer ' + alice.token },
  });
  check('you can delete your own, which is how changing a photo works', r.status < 400);

  console.log('\nWhat a signed-in user must NOT be able to do\n');
  r = await rpc(bob.token, 'create_experience', { raw_title: 'sneaking one in' });
  check('cannot call create_experience directly', r.status >= 400, JSON.stringify(r.body));

  r = await rpc(bob.token, 'resolve_experience', { raw_title: 'sneaking one in' });
  check('cannot call resolve_experience directly', r.status >= 400);

  r = await rpc(bob.token, 'merge_experiences', {
    loser: first.experience_id,
    winner: third.experience_id,
  });
  check('cannot merge experiences', r.status >= 400);

  r = await fetch(URL_BASE + `/rest/v1/profiles?id=eq.${bob.id}`, {
    method: 'PATCH',
    headers: { ...headers(bob.token), Prefer: 'return=minimal' },
    body: JSON.stringify({ follower_count: 9999 }),
  });
  check('cannot write your own follower_count (D16)', r.status >= 400, 'HTTP ' + r.status);

  r = await fetch(URL_BASE + `/rest/v1/profiles?id=eq.${bob.id}`, {
    method: 'PATCH',
    headers: { ...headers(bob.token), Prefer: 'return=minimal' },
    body: JSON.stringify({ handle: 'stolen_handle' }),
  });
  check('cannot write your own handle directly (D16)', r.status >= 400, 'HTTP ' + r.status);

  r = await fetch(URL_BASE + `/rest/v1/kreamis?id=eq.${edit.kreami_id}`, {
    method: 'PATCH',
    headers: { ...headers(bob.token), Prefer: 'return=minimal' },
    body: JSON.stringify({ rating: 0 }),
  });
  const changed = await rest(alice.token, `kreamis?select=rating&id=eq.${edit.kreami_id}`);
  check(
    "cannot edit somebody else's Kreami",
    changed.body?.[0]?.rating === 2,
    'rating is now ' + JSON.stringify(changed.body),
  );
} finally {
  console.log('\nCleaning up\n');
  await cleanup();
  console.log('  deleted ' + created.length + ' test accounts and everything they created');
}

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'all end-to-end checks passed'));
process.exit(failures ? 1 : 0);
