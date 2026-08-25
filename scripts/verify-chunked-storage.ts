/**
 * Verifies the SecureStore chunking adapter against a mock backend that enforces
 * the real 2048-byte per-value ceiling. Run with `npm run verify:storage`.
 *
 * Node runs TypeScript directly, so this needs no build step and no test runner.
 * If a real test framework arrives, this should become a normal test file.
 */

import { createChunkedStorage, type KeyValueBackend } from '../src/lib/chunked-storage.ts';

// Mimics expo-secure-store, including its hard 2048-byte ceiling per value.
const SECURE_STORE_LIMIT = 2048;

function makeBackend() {
  const store = new Map<string, string>();
  const backend: KeyValueBackend = {
    async getItemAsync(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    async setItemAsync(key, value) {
      const bytes = new TextEncoder().encode(value).length;
      if (bytes > SECURE_STORE_LIMIT) {
        throw new Error(`value for ${key} is ${bytes} bytes, over the ${SECURE_STORE_LIMIT} limit`);
      }
      store.set(key, value);
    },
    async deleteItemAsync(key) {
      store.delete(key);
    },
  };
  return { backend, store };
}

let failures = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

// A Supabase session is roughly this shape and comfortably over 2 KB.
const realisticSession = JSON.stringify({
  access_token: 'ey' + 'A'.repeat(4200),
  refresh_token: 'r'.repeat(64),
  expires_at: 1900000000,
  user: { id: '00000000-0000-0000-0000-000000000000', email: 'someone@example.com' },
});

async function main() {
  console.log(`session fixture: ${new TextEncoder().encode(realisticSession).length} bytes\n`);

  {
    console.log('round trips');
    const { backend } = makeBackend();
    const s = createChunkedStorage(backend);

    await s.setItem('short', 'hello');
    check('short value round-trips', (await s.getItem('short')) === 'hello');

    await s.setItem('session', realisticSession);
    check('oversized session round-trips', (await s.getItem('session')) === realisticSession);

    check('absent key returns null', (await s.getItem('nope')) === null);

    await s.setItem('empty', '');
    check('empty string round-trips as empty, not null', (await s.getItem('empty')) === '');
  }

  {
    console.log('\ncontrol: the raw backend rejects this value');
    const { backend } = makeBackend();
    let rejected = false;
    try {
      await backend.setItemAsync('raw', realisticSession);
    } catch {
      rejected = true;
    }
    check('writing the session unchunked would fail', rejected);
  }

  {
    console.log('\nchunk sizing');
    const { backend, store } = makeBackend();
    const s = createChunkedStorage(backend);
    await s.setItem('session', realisticSession);
    const parts = [...store.entries()].filter(([k]) => /\.\d+$/.test(k));
    const over = parts.filter(([, v]) => new TextEncoder().encode(v).length > SECURE_STORE_LIMIT);
    check(`split into ${parts.length} chunks, none over the limit`, over.length === 0);
  }

  {
    console.log('\nmulti-byte safety');
    const { backend } = makeBackend();
    const s = createChunkedStorage(backend);
    // Emoji are surrogate pairs; naive slicing by string length splits them.
    const emoji = '🍦'.repeat(900) + 'café ünïcode';
    await s.setItem('emoji', emoji);
    const back = await s.getItem('emoji');
    check('emoji and accents survive chunk boundaries', back === emoji);
    check('no replacement characters introduced', !(back ?? '').includes('�'));
  }

  {
    console.log('\noverwrite and delete');
    const { backend, store } = makeBackend();
    const s = createChunkedStorage(backend);

    await s.setItem('session', realisticSession);
    await s.setItem('session', 'tiny');
    check(
      'long value overwritten by short reads back short',
      (await s.getItem('session')) === 'tiny',
    );
    const leftovers = [...store.keys()].filter((k) => /^session\.\d+$/.test(k));
    check(
      `no stale chunks left behind (found ${leftovers.length}, expected 1)`,
      leftovers.length === 1,
    );

    await s.removeItem('session');
    check('removeItem clears the value', (await s.getItem('session')) === null);
    check(
      'removeItem leaves no keys at all',
      [...store.keys()].filter((k) => k.startsWith('session')).length === 0,
      [...store.keys()].join(','),
    );
  }

  {
    console.log('\ncorruption and legacy values');
    const { backend, store } = makeBackend();
    const s = createChunkedStorage(backend);

    // Written before chunking existed: bare key, no count.
    store.set('legacy', 'previously-stored');
    check('pre-chunking value still readable', (await s.getItem('legacy')) === 'previously-stored');

    await s.setItem('session', realisticSession);
    store.delete('session.1');
    check(
      'missing chunk reports absence rather than a truncated value',
      (await s.getItem('session')) === null,
    );

    store.set('bogus.chunks', 'not-a-number');
    check('non-numeric chunk count returns null', (await s.getItem('bogus')) === null);
  }

  {
    console.log('\ninterrupted write leaves no orphans');
    const { backend, store } = makeBackend();
    const s = createChunkedStorage(backend);
    // Simulate a crash after chunks were written but before the count landed.
    store.set('session.0', 'aaa');
    store.set('session.1', 'bbb');
    store.set('session.2', 'ccc');
    await s.setItem('session', 'fresh');
    check('orphaned chunks swept on next write', (await s.getItem('session')) === 'fresh');
    const remaining = [...store.keys()].filter((k) => /^session\.\d+$/.test(k));
    check(`only the new chunk remains (found ${remaining.length})`, remaining.length === 1);
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
