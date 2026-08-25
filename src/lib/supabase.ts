import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in your Supabase project values.',
  );
}

/**
 * SecureStore caps a single value at 2048 bytes, and a Supabase session with a
 * large JWT exceeds that. This adapter transparently splits a value across
 * numbered chunks and records the count under `<key>.chunks`.
 *
 * Anything written before chunking existed is still readable: with no chunk
 * count present we fall back to reading the bare key.
 */
const CHUNK_SIZE = 1800;

const chunkCountKey = (key: string) => `${key}.chunks`;
const chunkKey = (key: string, index: number) => `${key}.${index}`;

async function clearChunks(key: string): Promise<void> {
  const count = await SecureStore.getItemAsync(chunkCountKey(key));
  if (count !== null) {
    const n = Number.parseInt(count, 10);
    for (let i = 0; i < n; i++) {
      await SecureStore.deleteItemAsync(chunkKey(key, i));
    }
    await SecureStore.deleteItemAsync(chunkCountKey(key));
  }
  await SecureStore.deleteItemAsync(key);
}

const secureStoreAdapter: SupportedStorage = {
  async getItem(key) {
    const count = await SecureStore.getItemAsync(chunkCountKey(key));
    if (count === null) {
      // Either nothing stored, or a pre-chunking value.
      return SecureStore.getItemAsync(key);
    }
    const n = Number.parseInt(count, 10);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // A missing chunk means the write was interrupted; the value is
      // unusable, so report it as absent and let the caller re-authenticate.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key, value) {
    await clearChunks(key);
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
    // Written last so a partial write is never mistaken for a complete one.
    await SecureStore.setItemAsync(chunkCountKey(key), String(chunks.length));
  },

  async removeItem(key) {
    await clearChunks(key);
  },
};

/**
 * On web the client uses localStorage by default, which is what we want.
 * On native the session lives in the keychain/keystore via the adapter above.
 */
function resolveStorage(): SupportedStorage | undefined {
  return Platform.OS === 'web' ? undefined : secureStoreAdapter;
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: resolveStorage(),
    autoRefreshToken: true,
    persistSession: true,
    // Native has no URL to parse a session out of; deep links are handled
    // explicitly in the auth flow (Phase 1).
    detectSessionInUrl: Platform.OS === 'web',
  },
});
