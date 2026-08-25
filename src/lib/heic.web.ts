/**
 * HEIC support, browser side.
 *
 * Every iPhone shoots HEIC by default, and no browser engine except Safari can
 * decode it — so on Chrome, Brave, Edge and Firefox an iPhone photo is simply
 * not an image as far as the page is concerned. `expo-image-picker` does not
 * even fail on one: it reports width 0, height 0 and hands back a blob nothing
 * can read.
 *
 * The fix is to carry our own decoder: libheif, compiled to WebAssembly, via
 * heic-to. It costs 3 MB, which is more than the entire rest of the app, so it
 * is behind a dynamic import that only runs once a file has been sniffed and
 * found to actually be HEIC. Somebody uploading a JPEG never downloads a byte
 * of it.
 */
export type Decoded = { uri: string; width: number; height: number };

/**
 * The ISO base media file signature: a box length, then 'ftyp', then the
 * brand. Sniffing the bytes rather than trusting the extension, because HEICs
 * arrive named .jpg often enough — AirDrop, exports, well-meaning converters —
 * and a file named .heic that is really a JPEG should not pay for the decoder.
 *
 * AVIF shares this container and is deliberately absent from the list: every
 * current browser decodes it natively.
 */
const HEIF_BRANDS = [
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
];

export async function isHeif(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (header.length < 12) return false;

  const ascii = (from: number, to: number) =>
    String.fromCharCode(...header.subarray(from, to)).toLowerCase();

  return ascii(4, 8) === 'ftyp' && HEIF_BRANDS.includes(ascii(8, 12));
}

/** What the browser thinks an image's dimensions are, or zeros if it cannot read it. */
function measure(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = uri;
  });
}

/**
 * Converts a HEIC to a JPEG the rest of the pipeline can crop and resize, or
 * returns null if the file was never HEIC to begin with.
 *
 * Quality is high here on purpose: this output is an intermediate that gets
 * re-encoded at 0.8 after the resize, and compressing twice at the same
 * quality is how photos end up looking like they were faxed.
 */
export async function decodeHeic(uri: string): Promise<Decoded | null> {
  const blob = await (await fetch(uri)).blob();
  if (!(await isHeif(blob))) return null;

  // Only reached when the browser could not size the image itself, so Safari —
  // which decodes HEIC with the system codec like the phone does — never gets
  // here and never downloads the decoder. See the caller.
  const { heicTo } = await import('heic-to');
  const jpeg = await heicTo({ blob, type: 'image/jpeg', quality: 0.94 });

  const decodedUri = URL.createObjectURL(jpeg);
  return { uri: decodedUri, ...(await measure(decodedUri)) };
}
