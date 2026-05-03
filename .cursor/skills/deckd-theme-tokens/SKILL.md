---
name: deckd-theme-tokens
description: Canonical design token map for Deckd and the pattern for migrating hex literals into `src/lib/theme.ts`. Use when creating theme, migrating color/space literals in a screen, or proposing UI changes.
---

# Deckd theme tokens

## Canonical token set

```ts
// src/lib/theme.ts
export const colors = {
  brand:        '#B02020',  // primary red — CTAs, active states
  brandDark:    '#901A1A',  // pressed brand, badges
  bg:           '#FAFAFA',  // app background
  surface:      '#FFFFFF',  // cards, elevated surfaces
  ink:          '#1A1A1A',  // primary text
  inkMuted:     '#666666',  // secondary text
  inkSubtle:    '#999999',  // captions, meta
  border:       '#F0F0F0',  // light divider
  borderStrong: '#EAEAEA',  // pronounced divider
  warn:         '#F59E0B',  // stat accent (lightning, streak)
  neutral500:   '#475569',  // nav inactive
  neutral300:   '#94A3B8',  // nav micro-labels
} as const;

export const alpha = {
  brand20: 'rgba(176,32,32,0.2)',
  brand30: 'rgba(176,32,32,0.3)',
  whiteOverlay20: 'rgba(255,255,255,0.2)',
  whiteOverlay80: 'rgba(255,255,255,0.8)',
} as const;

export const radii = { sm: 6, md: 12, lg: 16, xl: 24, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, xxxxl: 40 } as const;

export const fonts = {
  regular:  'PlusJakartaSans-Regular',
  medium:   'PlusJakartaSans-Medium',
  semibold: 'PlusJakartaSans-SemiBold',
  bold:     'PlusJakartaSans-Bold',
  extra:    'PlusJakartaSans-ExtraBold',
} as const;

import { Platform } from 'react-native';

export const shadow = {
  card: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4 },
    android: { elevation: 2 },
  }),
  cta: Platform.select({
    ios: { shadowColor: colors.brand, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12 },
    android: { elevation: 6 },
  }),
  elevated: Platform.select({
    ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 8 },
    android: { elevation: 6 },
  }),
} as const;
```

## When to create this file

The first time you are asked to touch a screen for any UI reason, if `src/lib/theme.ts` does not yet exist, **create it as the first step** of that change. Do not migrate the whole repo at once.

## Migration pattern (per-screen)

1. Open the screen. Identify every hex literal and recurring spacing value.
2. Import tokens: `import { colors, radii, space, fonts, shadow } from '@theme';`
3. Replace literals in the `StyleSheet.create` block.
4. Do not change visual output — this is a refactor, not a redesign. If a literal doesn't match any token exactly, keep it literal and propose adding the token in the same PR.
5. Run `npm run typecheck` — if `@theme` alias isn't wired yet, use a relative import until it is.

## What not to tokenize (yet)

- Per-screen font sizes — they vary heavily between headlines, stat chips, and labels. Add to theme only when 3+ screens share a value.
- One-off `rgba(...)` overlays used in a single component.
- Shadows that are clearly bespoke to an animation state (pressed card lift, pass-phone reveal glow).

## Relationship to the rule

This skill is the **how**. The rule `.cursor/rules/theme-tokens.mdc` is the **what**. If you touch colors in a file matching the rule's glob, both are active — the rule rejects new hex literals, this skill provides the migration pattern.
