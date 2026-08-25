/**
 * PLACEHOLDER — replaced by generated output.
 *
 * Regenerate whenever the schema changes:
 *   npm run db:types:local     # against a local `supabase start` stack
 *   npm run db:types           # against the linked project (SUPABASE_PROJECT_ID)
 *
 * Never hand-edit. See docs/03-architecture.md.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
