---
name: card-rendering
description: Canonical playing-card rendering contract for Deckd. Use whenever a screen needs to render a card face, card back, or hand of cards. Consolidates the hardcoded JSX currently in `app/game/index.tsx` into a reusable `<PlayingCard>`.
---

# Card rendering — one source of truth

## Contract

```ts
// components/PlayingCard.tsx
import type { Suit, Rank } from '@lib/types';
import type { ViewStyle } from 'react-native';

export type PlayingCardSize = 'xs' | 'sm' | 'md' | 'lg';

export interface PlayingCardProps {
  rank: Rank;
  suit: Suit;
  face?: 'up' | 'down';          // default 'up'
  size?: PlayingCardSize;        // default 'md'
  elevated?: boolean;            // adds brand-ring + lift shadow
  style?: ViewStyle;             // for transform-based positioning (fan, rotation)
  onPress?: () => void;
}
```

## Size map

| size | width × height | font size | use case |
|---|---|---|---|
| xs | 16 × 24   | — | opponent card icons |
| sm | 60 × 88   | 12 | hand miniatures, discard preview |
| md | 90 × 130  | 20 | deck, discard, active-card slot |
| lg | 110 × 160 | 24 | center / active card |

## Rendering rules

- Face-up cards: rank top-left, suit icon under it, large tinted suit center, rank bottom-right (180° rotation).
- Face-down cards: brand-red back with soft "D" watermark at 20% opacity — matches the deck stack in `app/game/index.tsx`.
- Hearts / diamonds are `colors.brand`. Spades / clubs are `colors.ink`.
- Corner marks use `fonts.extra`, center tinted suit uses `lucide-react-native` sized ~0.5 × card width.
- Elevated cards: `borderColor: alpha.brand20`, `borderWidth: 2`, `shadow.cta` — matches the lifted J in the current hand.

## Animation seams

A `<PlayingCard>` is a presentational component. Animations are applied **from the outside** via `style` (transform-based) or by wrapping in `<Animated.View>`. Do not embed Reanimated hooks inside the card itself — that couples rendering to motion state.

For hand-fan animation, the wrapper computes per-card `{ rotate, translateX, translateY }` once from an active-index shared value, then passes the transform in via `style`.

## Migration plan (from current gameboard)

1. Create `components/PlayingCard.tsx` implementing the contract above. Use the existing styles in `app/game/index.tsx` as the visual reference — `.activeCard`, `.handCard`, `.handCardElevated`, `.deckCard`, `.cardRankTop`, `.cardSuitTop`, etc.
2. Add face-down rendering using the existing `.deckCard` styling.
3. Replace the hand's 4 hardcoded card blocks (lines ~104–136 of `app/game/index.tsx`) with 4 `<PlayingCard>` calls, passing the transform as `style`.
4. Replace the active card block with `<PlayingCard size="lg" rank="A" suit="hearts" elevated />`.
5. Leave the deck stub (`.deckCard`) and discard slot (`.discardSlot`) as-is — they're containers, not cards.
6. Verify visual parity on `npm run web` before committing.

## Future extensions (NOT scope of first cut)

- `variant: 'back-red' | 'back-logo' | 'back-custom'` — once the store sells card backs.
- `disabled: boolean` — for un-playable cards in the hand.
- `highlighted: boolean` — for legal-move hinting.
- Holographic foil / premium SKU rendering — probably a separate `<PremiumCard>` wrapper.

Keep the first extraction deliberately narrow. Ship a working replacement first, then iterate.
