/**
 * The pure half of the OpenGraph functions.
 *
 *   npm run verify:og
 *
 * Escaping is the part worth testing and the part a deploy cannot check for
 * you: experience titles and bios are written by users and go straight into
 * HTML attributes. A title containing a quote would otherwise close the
 * attribute and put whatever follows into the markup of a page that Slack,
 * iMessage and every crawler will fetch.
 */
import { average, clamp, escapeHtml, plural } from '../functions/_og.js';

let failures = 0;
function check(name, ok, detail) {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (!ok && detail ? '  — ' + detail : ''));
  if (!ok) failures++;
}

console.log('\nEscaping user-written text\n');

const attack = '" /><script>alert(1)</script><meta x="';
const escaped = escapeHtml(attack);
check('quotes cannot close the attribute', !escaped.includes('"'), escaped);
check('angle brackets cannot open a tag', !escaped.includes('<') && !escaped.includes('>'));
check('the script tag is inert', !escaped.includes('<script'), escaped.slice(0, 40));
check(
  'ampersands are escaped first, not twice',
  escapeHtml('a & b') === 'a &amp; b',
  escapeHtml('a & b'),
);
check(
  'an already-escaped entity is re-escaped, not collapsed',
  escapeHtml('&amp;') === '&amp;amp;',
);
check('single quotes too', escapeHtml("it's") === 'it&#39;s', escapeHtml("it's"));
check('null and undefined do not throw', escapeHtml(null) === '' && escapeHtml(undefined) === '');

console.log('\nClamping\n');

check('short text is untouched', clamp('Queueing in the rain', 70) === 'Queueing in the rain');
check('long text gets an ellipsis', clamp('x'.repeat(100), 70).endsWith('…'));
check('and respects the limit', clamp('x'.repeat(100), 70).length === 70);
check(
  'newlines collapse to spaces',
  clamp('a\n\nb', 70) === 'a b',
  JSON.stringify(clamp('a\n\nb', 70)),
);
check('surrounding whitespace goes', clamp('  hello  ', 70) === 'hello');

console.log('\nThe average rule (docs/02)\n');

check('under three Kreamis shows no average', average(2, 10) === null);
check('exactly three does', average(3, 12) === '4.0', String(average(3, 12)));
check('zero Kreamis does not divide by zero', average(0, 0) === null);
check('one decimal place', average(3, 10) === '3.3', String(average(3, 10)));

console.log('\nPlurals\n');
check('one Kreami', plural(1, 'Kreami', 'Kreamis') === '1 Kreami');
check('two Kreamis', plural(2, 'Kreami', 'Kreamis') === '2 Kreamis');
check('zero is plural', plural(0, 'Kreami', 'Kreamis') === '0 Kreamis');

console.log('\n' + (failures ? failures + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED'));
process.exit(failures ? 1 : 0);
