/**
 * Card backs used when a preset is staged as a physical deck object.
 *
 * Keeping this mapping outside individual surfaces means the library and setup
 * ritual cannot drift into showing different material cues for the same recipe.
 */
export const PRESET_BACKS: Record<string, string> = {
  freeplay: 'back-brand',
  'deal-two-each': 'back-crimson',
  blackjack: 'back-noir',
  poker: 'back-crimson',
};
