import { useRouter, type Href } from 'expo-router';

/**
 * Back, for a screen that can also be arrived at cold.
 *
 * `router.back()` throws when there is nothing to go back to — "The action
 * 'GO_BACK' was not handled by any navigator" — and every screen in this app
 * can be opened with no history behind it: a shared /e/:slug link, a bookmarked
 * /u/:handle, or simply reloading the page you are on. In development that
 * error is a red screen; in production it is a Back button that does nothing.
 *
 * So every Back needs somewhere to go when there is no history. The fallback
 * is where the person would have come from had they walked in.
 */
export function useGoBack(fallback: Href) {
  const router = useRouter();

  return () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallback);
  };
}
