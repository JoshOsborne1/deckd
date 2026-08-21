# RevK card fronts

Deckd uses the poker-size SVG faces generated from:

- Source: https://www.me.uk/cards/
- Licence: CC0 Public Domain
- Variant: poker, large indices, normal pips, plain Ace of Spades, blank credit/QR fields, warm ivory front `#fffdf8`

The final selected bundle is preserved at:

`tmp-card-deck-research/deckd-standard-52-fronts-jokers.zip`

`lib/revkCards.ts` contains the generated 52 front XML strings used at runtime through `react-native-svg` `SvgXml`. The optional joker pair is kept separately in `lib/cardJokers.ts` from the Notpeter public-domain source. Deckd's branded backs remain separate and are not replaced by this front-face source.
