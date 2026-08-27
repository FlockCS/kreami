import { SUPABASE_ANON_KEY, SUPABASE_URL } from './_config.js';

/**
 * Shared bits for the OpenGraph functions.
 *
 * These run at Cloudflare's edge in front of the static export. The export
 * produces one HTML shell for every route — verified: /e/:slug, /u/:handle and
 * / are byte-identical — so there is nowhere for per-page meta tags to live and
 * every shared link previews as a blank card. Which is a problem, because
 * /e/:slug and /u/:handle are precisely the URLs people share (docs/03).
 *
 * The approach is to rewrite the real page rather than serve crawlers a
 * substitute. HTMLRewriter streams the shell through, replaces the empty
 * <title> and appends the meta tags, and the app still boots normally
 * underneath. No user-agent sniffing: everyone gets the same bytes, so there is
 * no way for the preview and the page to drift apart, and nothing to keep in
 * step as crawlers come and go.
 */

/** Escapes for an HTML attribute. Titles and bios are user-written. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Previews truncate anyway; doing it here keeps the ellipsis ours. */
export function clamp(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}

class SetTitle {
  constructor(title) {
    this.title = title;
  }
  element(element) {
    element.setInnerContent(this.title);
  }
}

class AppendMeta {
  constructor(html) {
    this.html = html;
  }
  element(element) {
    element.append(this.html, { html: true });
  }
}

/**
 * Injects a title and card into the shell.
 *
 * Both og: and twitter: names are emitted. Most crawlers read og:, but
 * Twitter/X only reliably honours its own, and the duplication is a few bytes
 * against a preview card that either works or does not.
 */
export function withPreview(response, { title, description, url }) {
  const safeTitle = escapeHtml(clamp(title, 70));
  const safeDescription = escapeHtml(clamp(description, 200));
  const safeUrl = escapeHtml(url);

  const meta = `
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Kreami" />
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDescription}" />
<meta property="og:url" content="${safeUrl}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDescription}" />
<meta name="description" content="${safeDescription}" />`;

  const rewritten = new HTMLRewriter()
    .on('title', new SetTitle(clamp(title, 70)))
    .on('head', new AppendMeta(meta))
    .transform(response);

  // Diagnosable from the outside. A function that runs and finds nothing looks
  // exactly like one that never ran, which cost an afternoon once already.
  const headers = new Headers(rewritten.headers);
  headers.set('x-kreami-preview', 'hit');
  return new Response(rewritten.body, { status: rewritten.status, headers });
}

/**
 * Calls a Supabase RPC with the anon key. Anonymous read is the whole point:
 * these functions serve people who have never signed in and may never.
 *
 * Config comes from _config.js, written by the deploy workflow from the same
 * secrets the bundle is built with. A static import rather than a dashboard
 * binding means the deploy is self-contained: nothing to configure in a second
 * place, and no way for the two to disagree.
 */
export async function rpc(fn, args) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });

  if (!response.ok) return null;
  const body = await response.json();
  return Array.isArray(body) ? (body[0] ?? null) : body;
}

/** One decimal, or null below the threshold that makes an average meaningful. */
export function average(kreamiCount, ratingSum) {
  if (!kreamiCount || kreamiCount < 3) return null;
  return (ratingSum / kreamiCount).toFixed(1);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

/** The page, untouched, but labelled so the outside can tell what happened. */
export function miss(response) {
  const headers = new Headers(response.headers);
  headers.set('x-kreami-preview', 'miss');
  return new Response(response.body, { status: response.status, headers });
}
