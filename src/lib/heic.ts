/**
 * HEIC support, native side: there is nothing to do.
 *
 * iOS and Android decode HEIC with the system codec, so expo-image-manipulator
 * handles an iPhone photo without help. This file exists so that the 3 MB
 * WebAssembly decoder in heic.web.ts is never reachable from a native bundle —
 * Metro resolves `./heic` to this file everywhere except web.
 */
export type Decoded = { uri: string; width: number; height: number };

// The signature has to match heic.web.ts: this file is what TypeScript
// resolves `./heic` to, so it is the one that defines the contract.
export async function decodeHeic(_uri: string): Promise<Decoded | null> {
  return null;
}
