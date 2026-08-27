/**
 * Overwritten by .github/workflows/deploy-web.yml at deploy time with the same
 * values the client bundle is built from.
 *
 * Committed empty on purpose: the import is static, so the file has to exist
 * for the bundle to build, and empty values make the functions no-ops locally
 * rather than something that half-works against the wrong project.
 */
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
