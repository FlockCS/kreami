/**
 * The HEIC sniffer, checked against real file headers.
 *
 *   npm run verify:heic
 *
 * This one function decides whether a three-megabyte WebAssembly decoder gets
 * downloaded, so both of its answers are expensive to get wrong: a false
 * negative leaves an iPhone photo unusable, a false positive ships the decoder
 * to somebody who picked a JPEG.
 *
 * It reads bytes rather than filenames on purpose. HEICs arrive named .jpg all
 * the time — AirDrop, exports, well-meaning converters — and the extension is
 * the one thing about a file nobody has to tell the truth about.
 */
import { isHeif } from '../src/lib/heic.web.ts';

let failures = 0;
function check(name: string, ok: boolean) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name);
  if (!ok) failures++;
}

/** An ISO base media header: 4 length bytes, 'ftyp', then the brand. */
function ftyp(brand: string): Blob {
  const bytes = new Uint8Array(32);
  bytes.set([0, 0, 0, 0x20], 0);
  bytes.set(
    [...'ftyp'].map((c) => c.charCodeAt(0)),
    4,
  );
  bytes.set(
    [...brand].map((c) => c.charCodeAt(0)),
    8,
  );
  return new Blob([bytes]);
}

console.log('\nWhat counts as HEIC\n');

for (const brand of ['heic', 'heix', 'hevc', 'mif1', 'msf1']) {
  check(`${brand} is HEIF`, await isHeif(ftyp(brand)));
}

console.log('\nWhat does not\n');

// Every current browser decodes AVIF, so sending it through libheif would be
// three megabytes spent to reach the same picture.
check('avif is left to the browser', !(await isHeif(ftyp('avif'))));
check('mp4 is not an image', !(await isHeif(ftyp('mp42'))));

check(
  'a JPEG is not HEIF',
  !(await isHeif(
    new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0])]),
  )),
);
check(
  'a PNG is not HEIF',
  !(await isHeif(
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])]),
  )),
);

// Shorter than the header it would have to read. Must answer, not throw.
check('a truncated file is not HEIF', !(await isHeif(new Blob([new Uint8Array([0, 0, 0])]))));
check('an empty file is not HEIF', !(await isHeif(new Blob([]))));

// The bytes are what matter, not the name — a real HEIC called photo.jpg is
// still a HEIC, and this is the case the extension check would get wrong.
check('the brand decides, not the extension', await isHeif(ftyp('heic')));

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
