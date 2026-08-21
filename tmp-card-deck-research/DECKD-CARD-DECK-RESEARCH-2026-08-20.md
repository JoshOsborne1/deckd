# Deckd card-deck replacement research

**Date:** 2026-08-20  
**Status:** selected candidate wired into the card-face renderer; animation pass not started

## Recommendation

Use a **standard 52-card pack** built from RevK's poker-size SVG fronts, with Notpeter's public-domain joker pair as optional extras:

- large corner indices
- normal pip layouts
- plain Ace of Spades
- blank Ace credit/QR fields
- warm ivory fronts (`#fffdf8`)
- Deckd's existing branded backs retained separately
- two clean optional jokers from Notpeter, with no cartoon-face treatment

The source offers downloadable SVG decks, configurable card sizes, index sizes, pip styles, courts, and backs, and is released under CC0 with no attribution requirement.[1]

This is the best fit for Deckd because the poker card viewBox is `240 × 336`, exactly 5:7, matching the existing `PlayingCard` shell (`90 × 126`, `110 × 154`). The generated files also preserve real pip placement and traditional mirrored courts instead of forcing Deckd to keep hand-drawing suit glyphs and toy court faces.

### Prepared asset

`tmp-card-deck-research/deckd-standard-52-fronts-jokers.zip`

Local verification:

- 52 standard front SVGs plus 2 optional joker SVGs
- final bundle contains exactly 54 SVGs and no replacement back
- every standard front uses the 5:7 `240 × 336` viewBox
- no default `cards.revk.uk` credit or QR string remains in the clean output
- Ace of Spades XML contains no URL, domain, credit, or text element
- 52 front XML strings are wired through `react-native-svg` `SvgXml`
- joker XML is wired through `react-native-svg` `SvgXml` from the Notpeter public-domain pair
- Deckd's existing branded backs remain unchanged
- the old runtime pip/court renderer is no longer used for normal cards

Preview images:

- `tmp-card-deck-research/revk-mobile-variant-preview.png`
- `tmp-card-deck-research/card-deck-comparison.png`

## Why this beats the current deck

The current Deckd face is runtime artwork: custom suit paths, hand-positioned pips, and hand-drawn court figures in `CardFaceArtwork.tsx` / `CardCourt.tsx`. That is why the face geometry gets cramped as cards shrink. A finished vector deck gives the animation pass stable rank, pip, court, and card proportions.

The RevK variant keeps the corner index large without letting it collide with the pip field. The courts are detailed enough to feel like real playing cards, but the numbered cards stay plain and readable. The plain Ace removes the distracting QR/URL treatment from the default preview.

The optional jokers use the standard suit-symbol layout with a real JOKER wordmark in black/red variants. They were checked at Deckd's `sm` (`60 × 84`) and `md` (`90 × 126`) sizes; the placeholder medallion joker is gone.

## Alternatives checked

| Candidate | Licence | Verdict |
|---|---|---|
| **Saul Spatz SVGCards** | Public domain, including commercial use.[2] | Best raw jumbo-index treatment. Rejected for now because its exported cards are `210 × 315` (2:3), so fitting them into Deckd's existing 5:7 shell would recreate the scaling problem. It also has vertical/horizontal variants, which adds a layout decision we do not need. |
| **Notpeter Vector Playing Cards** | Public domain or WTFPL, explicitly allowing commercial embedding.[3] | Selected for the optional joker pair. Its standard face family is denser than RevK, but its red/black suit-symbol jokers are cleaner than the old Deckd placeholder. |
| **Hayeah playing-card assets** | MIT, with attribution/licence notice required in copies.[4] | The same Byron Knoll-derived visual family as Notpeter. Commercially safe, but not a strong replacement for the current visual language. |
| **htdebeer SVG-cards** | LGPL-2.1.[5] | Good-looking and technically scalable, but more ornate and heavier to integrate. The licence is usable in commercial software, but adds obligations we do not need for a basic deck. |

## K3 handoff decision

Do **not** let K3 tune card motion against the old runtime artwork. The selected RevK face geometry is now wired, so K3 can tune `CardFlight`, `HandFan`, deal choreography, flips, and game layouts against the final 5:7 card shell once the normal K3 gates are open.

The implementation uses generated RN-SVG artwork rather than a browser-only external SVG sprite. The standard pack is 52 fronts; jokers are optional. Keep the existing Deckd backs exactly as-is.

## Sources

[1] https://www.me.uk/cards — RevK SVG playing cards
[2] https://github.com/saulspatz/SVGCards — Saul Spatz SVGCards
[3] https://github.com/notpeter/Vector-Playing-Cards — Notpeter Vector Playing Cards
[4] https://github.com/hayeah/playing-cards-assets — Hayeah playing card assets
[5] https://github.com/htdebeer/SVG-cards — htdebeer SVG-cards
