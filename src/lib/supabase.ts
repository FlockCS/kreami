import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { createChunkedStorage } from './chunked-storage';
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
 * On web the client uses localStorage by default, which is what we want.
 * On native the session lives in the keychain/keystore via the adapter above.
 */
const secureStoreAdapter = createChunkedStorage(SecureStore);

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
