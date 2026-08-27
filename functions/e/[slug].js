import { average, plural, rpc, withPreview } from '../_og.js';

/**
 * Link preview for a shared experience.
 *
 * The description leads with the average and the count, because that is the
 * argument for clicking: a thing everyone has done, and how much people
 * disagree about it. A thread with two Kreamis says so rather than showing a
 * misleading 5.0 — the same rule the app itself follows (docs/02).
 */
export async function onRequest(context) {
  const response = await context.next();

  // Never let a preview break the page. If Supabase is slow, down, or the slug
  // is nonsense, the visitor still gets the app — they just get it with the
  // blank card that was there before this function existed.
  try {
    const experience = await rpc(context.env, 'get_experience_by_slug', {
      s: context.params.slug,
    });
    if (!experience?.title) return response;

    const count = experience.kreami_count ?? 0;
    const avg = average(count, experience.rating_sum);

    const description =
      count === 0
        ? 'Nobody has rated this yet. Be first.'
        : avg
          ? `${avg}/5 Kreams from ${plural(count, 'person', 'people')}. What would you give it?`
          : `${plural(count, 'Kreami', 'Kreamis')} so far — not enough for an average yet. What would you give it?`;

    return withPreview(response, {
      title: experience.title,
      description,
      url: new URL(context.request.url).toString(),
    });
  } catch {
    return response;
  }
}
