import { plural, rpc, withPreview } from '../_og.js';

/**
 * Link preview for a profile.
 *
 * Leads with "average Kream given" where there is one, because that is the
 * number people have opinions about — a 4.6 loves everything, a 1.8 means their
 * 5/5 counts (docs/08). A bio, if they wrote one, says more than any stat.
 */
export async function onRequest(context) {
  const response = await context.next();

  try {
    const profile = await rpc(context.env, 'public_profile', {
      target_handle: context.params.handle,
    });
    if (!profile?.handle) return response;

    const kreamis = profile.kreami_count ?? 0;
    const given = profile.avg_kream_given;

    const stats =
      kreamis === 0
        ? 'Not rated anything yet.'
        : given
          ? `${plural(kreamis, 'Kreami', 'Kreamis')}, averaging ${given}/5.`
          : `${plural(kreamis, 'Kreami', 'Kreamis')}.`;

    return withPreview(response, {
      title: `${profile.display_name} (@${profile.handle})`,
      description: profile.bio ? `${profile.bio} — ${stats}` : `${stats} On Kreami.`,
      url: new URL(context.request.url).toString(),
    });
  } catch {
    return response;
  }
}
