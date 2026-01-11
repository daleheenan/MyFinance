/**
 * Analytics Page
 * Redirects to Analytics Summary page
 */

/**
 * Mount - redirect to summary page
 */
export async function mount(el, params) {
  // Redirect to the summary page
  window.location.hash = '#/analytics/summary';
}

/**
 * Unmount - no cleanup needed for redirect
 */
export function unmount() {
  // Nothing to clean up
}
