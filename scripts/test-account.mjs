/**
 * Creates (or signs in) a throwaway account against the DEV project and prints
 * an access token, so UI flows that need a session can be exercised without a
 * real person and a real inbox.
 *
 *   node scripts/test-account.mjs                # default test account
 *   node scripts/test-account.mjs bob            # a second, distinct account
 *
 * Uses only the anon key — the same credentials the app ships with — so it can
 * do nothing a signed-in user could not. It depends on the project allowing
 * email sign-up without confirmation; if confirmation is on, it says so and
 * exits rather than pretending to have succeeded.
 *
 * These accounts are real rows in kreami-dev. Clean them up with
 * delete_account() when finished, or from the dashboard.
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

const URL = env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: KEY, 'Content-Type': 'application/json' };

const name = process.argv[2] ?? 'tester';
// example.com is reserved by RFC 2606 and can never route to a real inbox.
const email = `kreami+${name}@example.com`;
const password = `test-${name}-pw-8842`;

async function post(pathname, body) {
  const r = await fetch(URL + pathname, {
    method: 'POST',
    headers: H,
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

let session = null;

const signIn = await post('/auth/v1/token?grant_type=password', { email, password });
if (signIn.status === 200) {
  session = signIn.body;
  console.log('signed in existing account');
} else {
  const signUp = await post('/auth/v1/signup', {
    email,
    password,
    data: { full_name: name[0].toUpperCase() + name.slice(1) },
  });
  if (signUp.status >= 400) {
    console.error('sign-up failed:', signUp.status, JSON.stringify(signUp.body));
    process.exit(1);
  }
  if (!signUp.body.access_token) {
    console.error(
      'Account created but no session returned — the project requires email confirmation.\n' +
        'Turn off "Confirm email" for kreami-dev (Authentication -> Sign In / Providers -> Email),\n' +
        'or run a local Supabase stack, and try again.',
    );
    process.exit(2);
  }
  session = signUp.body;
  console.log('created new account');
}

console.log('email        :', email);
console.log('password     :', password);
console.log('user id      :', session.user?.id);
console.log('access token :', session.access_token);
