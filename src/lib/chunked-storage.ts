/**
 * SecureStore caps a single value at 2048 bytes, and a Supabase session with a
 * large JWT exceeds that. This wraps any key/value backend so long values are
 * split across numbered chunks, with the count recorded under `<key>.chunks`.
 *
 * The backend is injected rather than imported so the behaviour is testable
 * without a device. See scripts/verify-chunked-storage.ts.
 */

export type KeyValueBackend = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type ChunkedStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/**
 * SecureStore's limit is 2048 bytes, not characters. A multi-byte character
 * near the boundary could push a chunk over, so we slice conservatively and
 * measure in UTF-8 bytes rather than trusting string length.
 */
const MAX_CHUNK_BYTES = 1536;

const countKey = (key: string) => `${key}.chunks`;
const partKey = (key: string, index: number) => `${key}.${index}`;

const byteLength = (s: string) => new TextEncoder().encode(s).length;

/** Split on byte size without ever cutting a surrogate pair or multi-byte char. */
function splitByBytes(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';
  // Iterating the string yields whole code points, so surrogate pairs stay intact.
  for (const char of value) {
    if (byteLength(current) + byteLength(char) > maxBytes) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current.length > 0 || chunks.length === 0) chunks.push(current);
  return chunks;
}

export function createChunkedStorage(backend: KeyValueBackend): ChunkedStorage {
  /**
   * Removes a value however it was stored. `limit` lets a caller sweep past the
   * recorded count to clear orphans left behind by an interrupted write.
   */
  async function clear(key: string, limit = 0): Promise<void> {
    const recorded = await backend.getItemAsync(countKey(key));
    const count = recorded === null ? 0 : Number.parseInt(recorded, 10);
    const upTo = Math.max(Number.isNaN(count) ? 0 : count, limit);
    for (let i = 0; i < upTo; i++) {
      await backend.deleteItemAsync(partKey(key, i));
    }
    // Keep going past the recorded count until a gap, so chunks orphaned by an
    // interrupted write are collected rather than accumulating forever.
    for (let i = upTo; ; i++) {
      if ((await backend.getItemAsync(partKey(key, i))) === null) break;
      await backend.deleteItemAsync(partKey(key, i));
    }
    await backend.deleteItemAsync(countKey(key));
    await backend.deleteItemAsync(key);
  }

  return {
    async getItem(key) {
      const recorded = await backend.getItemAsync(countKey(key));
      if (recorded === null) {
        // Either nothing stored, or a value written before chunking existed.
        return backend.getItemAsync(key);
      }
      const count = Number.parseInt(recorded, 10);
      if (Number.isNaN(count) || count < 0) return null;

      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await backend.getItemAsync(partKey(key, i));
        // A missing chunk means the write was interrupted. The value cannot be
        // reassembled, so report absence and let the caller re-authenticate.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      const chunks = splitByBytes(value, MAX_CHUNK_BYTES);
      // Sweep beyond the new count so a longer previous value leaves nothing behind.
      await clear(key, chunks.length);
      for (let i = 0; i < chunks.length; i++) {
        await backend.setItemAsync(partKey(key, i), chunks[i]);
      }
      // Written last, so a partial write is never mistaken for a complete one.
      await backend.setItemAsync(countKey(key), String(chunks.length));
    },

    async removeItem(key) {
      await clear(key);
    },
  };
}
