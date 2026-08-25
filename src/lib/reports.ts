import { useMutation } from '@tanstack/react-query';

import { supabase } from './supabase';

/**
 * What a report can be about. The wording is what the person filing it reads,
 * so it describes the content rather than naming a policy — somebody reporting
 * a slur should not have to decide between "hate" and "harassment" as legal
 * terms before they can get help.
 */
export type ReportReason =
  'spam' | 'harassment' | 'hate' | 'sexual' | 'violence' | 'duplicate_experience' | 'other';

export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'harassment', label: 'Targets or harasses somebody' },
  { key: 'hate', label: 'Hate speech or slurs' },
  { key: 'sexual', label: 'Sexual content' },
  { key: 'violence', label: 'Violence or threats' },
  { key: 'spam', label: 'Spam or a scam' },
  { key: 'other', label: 'Something else' },
];

/** Only offered on an experience, where a duplicate is a real thing to report. */
export const DUPLICATE_REASON: { key: ReportReason; label: string } = {
  key: 'duplicate_experience',
  label: 'Already exists as another experience',
};

export type ReportTarget =
  | { kind: 'kreami'; id: string }
  | { kind: 'experience'; id: string }
  | { kind: 'user'; id: string };

/**
 * Files a report. Exactly one target, enforced by the database as well as
 * here: a report about "this Kreami and also that person" has no single thing
 * a moderator can act on.
 *
 * There is no read path. You cannot list your own reports — watching one
 * disappear would turn the queue into a channel for learning what gets
 * actioned and how fast. See the migration.
 */
export function useSubmitReport() {
  return useMutation({
    mutationFn: async ({
      target,
      reason,
      detail,
    }: {
      target: ReportTarget;
      reason: ReportReason;
      detail?: string;
    }) => {
      const { data, error } = await supabase.rpc('submit_report', {
        reason,
        detail: detail?.trim() || undefined,
        kreami: target.kind === 'kreami' ? target.id : undefined,
        experience: target.kind === 'experience' ? target.id : undefined,
        target_user: target.kind === 'user' ? target.id : undefined,
      });
      if (error) throw new Error(error.message);
      return data as string;
    },
  });
}
