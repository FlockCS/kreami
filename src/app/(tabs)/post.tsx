import { Redirect } from 'expo-router';

/**
 * Never rendered. The tab's press listener intercepts and pushes /compose as a
 * modal; this exists only so the tab has a route to hang off. The redirect is
 * the safety net for a deep link that reaches it anyway.
 */
export default function PostTab() {
  return <Redirect href="/compose" />;
}
