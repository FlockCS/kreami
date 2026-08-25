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
    // Exactly what src/app/settings.tsx does, and in the same order: Storage
    // does not cascade from auth.users and Postgres cannot reach it, so the
    // files have to go first, while the session can still authorise it.
    const listed = await fetch(URL_BASE + '/storage/v1/object/list/avatars', {
      method: 'POST',
      headers: headers(u.token),
      body: JSON.stringify({ prefix: u.id + '/', limit: 100 }),
    });
    const files = await listed.json().catch(() => []);
    for (const f of Array.isArray(files) ? files : []) {
      // No Content-Type here. headers() sets application/json, and Storage
      // rejects a JSON content-type with an empty body — a 400 that looks
      // exactly like a permissions failure and is not one.
      await fetch(URL_BASE + `/storage/v1/object/avatars/${u.id}/${f.name}`, {
        method: 'DELETE',
        headers: { apikey: ANON, Authorization: 'Bearer ' + u.token },
      });
    }
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

  console.log('\nNotifications\n');
  // bob followed alice and liked her Kreami earlier in this run, so alice
  // should have been told about both without anything else happening.
  r = await rpc(alice.token, 'activity_feed', { lim: 30 });
  const feedRows = Array.isArray(r.body) ? r.body : [];
  const kinds = feedRows.map((n) => n.kind);
  check('alice was told about the follow', kinds.includes('new_follower'), JSON.stringify(kinds));
  check('and about the like', kinds.includes('kreami_liked'), JSON.stringify(kinds));

  const follower = feedRows.find((n) => n.kind === 'new_follower');
  check('the row names the actor', follower?.actor_handle === bobHandle, follower?.actor_handle);
  check('and starts out unread', follower?.read_at === null);

  // bob rated the same experience alice had already rated, which is the
  // retention loop that owes nothing to the follow graph.
  check(
    'rating an experience notifies everyone already on it',
    kinds.includes('experience_activity'),
    JSON.stringify(kinds),
  );
  const activity = feedRows.find((n) => n.kind === 'experience_activity');
  check('and carries the experience it happened on', Boolean(activity?.experience_slug));

  // The cap. bob's third post was on a DIFFERENT experience, so use a fresh
  // one: alice rates something, bob joins it twice, and the second must be
  // silent because one already landed inside the window.
  const capTitle = `Being notified twice about ${suffix}`;
  await rpc(alice.token, 'post_kreami', { raw_title: capTitle, rating: 3 });
  r = await rpc(bob.token, 'post_kreami', { raw_title: capTitle, rating: 5 });
  const capExperience = (Array.isArray(r.body) ? r.body[0] : r.body)?.experience_id;
  if (capExperience) experiences.add(capExperience);

  r = await rest(
    alice.token,
    `notifications?select=id&kind=eq.experience_activity&experience_id=eq.${capExperience}`,
  );
  const firstWave = Array.isArray(r.body) ? r.body.length : -1;
  check(
    'the first person to join an experience notifies you once',
    firstWave === 1,
    String(firstWave),
  );

  // A third account joining the same experience inside 24h must not add a row.
  const carol = await makeUser('carol');
  created.push(carol);
  await rpc(carol.token, 'claim_handle', { new_handle: `zz_c${suffix}` });
  await rpc(carol.token, 'post_kreami', { raw_title: capTitle, rating: 1 });

  r = await rest(
    alice.token,
    `notifications?select=id&kind=eq.experience_activity&experience_id=eq.${capExperience}`,
  );
  const secondWave = Array.isArray(r.body) ? r.body.length : -1;
  check('a second one inside 24h is capped (docs/06)', secondWave === 1, String(secondWave));

  // Self-actions are silent: carol liking her own Kreami tells nobody.
  r = await rest(carol.token, `kreamis?select=id&user_id=eq.${carol.id}`);
  const carolKreami = r.body?.[0]?.id;
  await rpc(carol.token, 'toggle_like', { target: carolKreami });
  r = await rest(carol.token, `notifications?select=id&kind=eq.kreami_liked`);
  check('liking your own Kreami notifies nobody', r.body?.length === 0, JSON.stringify(r.body));

  r = await rest(bob.token, `notifications?select=id&user_id=eq.${alice.id}`);
  check(
    "cannot read somebody else's notifications",
    Array.isArray(r.body) && r.body.length === 0,
    JSON.stringify(r.body).slice(0, 120),
  );

  r = await rpc(alice.token, 'mark_notifications_read', {});
  check(
    'mark-all-read clears the unread rows',
    typeof r.body === 'number' && r.body > 0,
    JSON.stringify(r.body),
  );

  r = await rest(alice.token, 'notifications?select=id&read_at=is.null');
  check('and leaves nothing unread', r.body?.length === 0, JSON.stringify(r.body));

  console.log('\nFinding people\n');
  r = await rpc(null, 'search_profiles', { q: aliceHandle });
  let hits = Array.isArray(r.body) ? r.body : [];
  check(
    'an exact handle search finds them',
    hits[0]?.id === alice.id,
    JSON.stringify(hits.map((h) => h.handle)),
  );
  check('and works logged out — it is the top of the funnel', hits.length > 0);

  r = await rpc(bob.token, 'search_profiles', { q: 'Alice' });
  hits = Array.isArray(r.body) ? r.body : [];
  check(
    'display names are searchable too',
    hits.some((h) => h.id === alice.id),
  );
  check(
    'and the row knows bob follows her',
    hits.find((h) => h.id === alice.id)?.is_following === true,
  );

  r = await rpc(alice.token, 'search_profiles', { q: aliceHandle });
  hits = Array.isArray(r.body) ? r.body : [];
  check('you are marked as yourself in your own results', hits[0]?.is_self === true);

  // The whole reason this is an RPC: PostgREST's .or() filter treats these as
  // grammar, so interpolating them client-side changed what was being asked.
  for (const nasty of ['a,b', 'a)b', '*', '%']) {
    r = await rpc(bob.token, 'search_profiles', { q: nasty });
    check(`"${nasty}" is a search term, not syntax`, r.status === 200, 'HTTP ' + r.status);
  }

  r = await rpc(bob.token, 'search_profiles', { q: 'a' });
  check('one character is too short to search', Array.isArray(r.body) && r.body.length === 0);

  r = await rpc(bob.token, 'suggested_profiles', {});
  check(
    'suggestions are readable and empty until curated',
    Array.isArray(r.body),
    JSON.stringify(r.body).slice(0, 120),
  );

  r = await rest(bob.token, 'suggested_profiles?select=profile_id');
  check('the curation table itself is not client-readable', r.status >= 400, 'HTTP ' + r.status);

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

  // Left in place deliberately: cleanup below deletes bob's account, and the
  // check after it proves the file went with him. A public bucket keeping the
  // face of somebody who asked to be forgotten is the failure being guarded.
  r = await putAvatar(bob.token, `${bob.id}/leaving.png`);
  check('bob has a photo to leave behind', r.status < 400, 'HTTP ' + r.status);

  console.log('\nReports\n');
  r = await rpc(bob.token, 'submit_report', {
    reason: 'spam',
    detail: 'Testing the queue.',
    kreami: edit.kreami_id,
  });
  check(
    'a Kreami can be reported',
    r.status === 200 && typeof r.body === 'string',
    JSON.stringify(r.body),
  );

  r = await rpc(bob.token, 'submit_report', { reason: 'harassment', target_user: alice.id });
  check('so can an account', r.status === 200, JSON.stringify(r.body));

  r = await rpc(bob.token, 'submit_report', {
    reason: 'duplicate_experience',
    experience: first.experience_id,
  });
  check('so can an experience', r.status === 200, JSON.stringify(r.body));

  // The constraint is the schema saying what the UI must not get wrong: a
  // report about two things has nothing single to action.
  r = await rpc(bob.token, 'submit_report', {
    reason: 'spam',
    kreami: edit.kreami_id,
    target_user: alice.id,
  });
  check('but not about two things at once', r.status >= 400, 'HTTP ' + r.status);

  r = await rpc(bob.token, 'submit_report', { reason: 'spam' });
  check('nor about nothing', r.status >= 400, 'HTTP ' + r.status);

  r = await rpc(bob.token, 'submit_report', { reason: 'spam', target_user: bob.id });
  check('nor about yourself', r.status >= 400, 'HTTP ' + r.status);

  r = await rpc(null, 'submit_report', { reason: 'spam', kreami: edit.kreami_id });
  check('anonymous callers cannot report', r.status >= 400, 'HTTP ' + r.status);

  // Reading your own reports back would turn the queue into a channel for
  // learning what gets actioned and how fast, so there is no read path at all.
  r = await rest(bob.token, 'reports?select=id');
  check('nobody can read the report queue', r.status >= 400, 'HTTP ' + r.status);

  r = await rest(bob.token, 'admin_report_queue?select=id');
  check('nor the admin view over it', r.status >= 400, 'HTTP ' + r.status);

  r = await rest(bob.token, 'admin_matching_stats?select=experiences');
  check('nor the matching stats', r.status >= 400, 'HTTP ' + r.status);

  r = await rest(bob.token, 'admin_duplicate_candidates?select=score');
  check('nor the duplicate report', r.status >= 400, 'HTTP ' + r.status);

  r = await rpc(bob.token, 'nightly_maintenance', {});
  check('and maintenance is not an API', r.status >= 400, 'HTTP ' + r.status);

  r = await rpc(bob.token, 'reconcile_counters', {});
  check('nor is counter reconciliation', r.status >= 400, 'HTTP ' + r.status);

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
  const bobId = created[1]?.id;
  await cleanup();
  console.log('  deleted ' + created.length + ' test accounts and everything they created');

  if (bobId) {
    // The account is gone; the file must be too. This is the check that caught
    // an attempt to do this cleanup in delete_account(), which Postgres will
    // not allow and which broke account deletion entirely.
    // Storage answers a missing public object with HTTP 400 wrapping a 404
    // body, so "not 200" is the honest assertion here.
    const gone = await fetch(URL_BASE + `/storage/v1/object/public/avatars/${bobId}/leaving.png`);
    check('leaving takes your photo with you', gone.status >= 400, 'HTTP ' + gone.status);

    const stillThere = await rest(null, `profiles?select=handle&id=eq.${bobId}`);
    check(
      'and the account really was deleted',
      Array.isArray(stillThere.body) && stillThere.body.length === 0,
      JSON.stringify(stillThere.body),
    );
  }
}

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'all end-to-end checks passed'));
process.exit(failures ? 1 : 0);
