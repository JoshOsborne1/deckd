export interface RulesGuide {
  id: string;
  title: string;
  summary: string;
  steps: readonly string[];
  win: string;
  tableNote: string;
}

/**
 * Plain-English rule cards for the built-in recipes. Keeping this copy next to
 * the engine recipes means setup and play can render the same explanation
 * without duplicating game-specific claims in UI components.
 */
export const RULES_GUIDES: Record<string, RulesGuide> = {
  freeplay: {
    id: 'freeplay',
    title: 'Freeplay',
    summary: 'A blank deck for your own table rules.',
    steps: [
      'Deal, draw, flip, discard, or reorder cards whenever you like.',
      'Pass the phone when the next player should choose the move.',
      'Use the event log when you want to retrace the table.',
    ],
    win: 'There is no built-in winner. End the table when your round is over.',
    tableNote: 'The suggestion strip points at a useful next move without closing off the rest of the deck.',
  },
  'deal-two-each': {
    id: 'deal-two-each',
    title: 'Deal 2 each',
    summary: 'A quick starting hand for inventing a game together.',
    steps: [
      'Everyone receives two face-down cards from the deck.',
      'Draw, reveal, discard, or reorder using the shared table controls.',
      'Pass the phone after each player has finished their move.',
    ],
    win: 'There is no fixed winner. End the table when your house rules say the round is done.',
    tableNote: 'Keep the deck moving; the table never hides a legal generic action.',
  },
  war: {
    id: 'war',
    title: 'War',
    summary: 'Flip the top card. Highest rank takes the battle.',
    steps: [
      'Each player starts with a private pile of face-down cards.',
      'Tap FLIP to reveal one card from each pile.',
      'If ranks tie, place down cards and flip again for the war.',
    ],
    win: 'The player who takes all cards wins the table.',
    tableNote: 'The battle pile is public; your remaining pile stays face-down.',
  },
  'go-fish': {
    id: 'go-fish',
    title: 'Go Fish',
    summary: 'Ask for ranks, collect books of four, and finish with the most.',
    steps: [
      'Ask the next player for a rank already in your hand.',
      'If they have it, those cards move to your hand; otherwise draw one.',
      'Lay down four-of-a-kind books and keep asking when you hit.',
    ],
    win: 'When the hands clear, the player with the most books wins.',
    tableNote: 'Only ranks you hold are offered as asks, so every button is a legal request.',
  },
  'old-maid': {
    id: 'old-maid',
    title: 'Old Maid',
    summary: 'Lay down matching pairs, then draw until one player holds the maid.',
    steps: [
      'Pair matching ranks in your hand before you draw.',
      'Draw one hidden card from the next active hand.',
      'Keep cycling until every pair is down and one card remains.',
    ],
    win: 'The player left holding the unmatched joker is the Old Maid.',
    tableNote: 'Pairs are placed on your table so the hand count stays honest.',
  },
  'crazy-eights': {
    id: 'crazy-eights',
    title: 'Crazy Eights',
    summary: 'Match suit or rank. Eights are wild.',
    steps: [
      'Play a card matching the discard top by suit or rank.',
      'An eight can be played on anything and keeps the round moving.',
      'If nothing fits, draw one card and pass when it still does not fit.',
    ],
    win: 'The first player to empty their hand wins the round.',
    tableNote: 'The action rail only offers cards that match the live discard.',
  },
  sevens: {
    id: 'sevens',
    title: 'Sevens',
    summary: 'Open with sevens, build each suit outward, and empty your hand first.',
    steps: [
      'Play any seven to open its suit run on the table.',
      'Extend a run one rank up or down in the same suit.',
      'Pass when no card in your hand can legally extend a run.',
    ],
    win: 'The first player to play every card wins the round.',
    tableNote: 'The communal row shows the runs; your hand remains private until played.',
  },
  klondike: {
    id: 'klondike',
    title: 'Klondike',
    summary: 'Build four same-suit foundations from ace to king.',
    steps: [
      'Turn one card from the stock into the waste, or recycle the waste when the stock is empty.',
      'Build tableau columns downward in alternating colors, with kings opening empty columns.',
      'Move cards up to a foundation in suit order, starting with aces.',
    ],
    win: 'Move all 52 cards to the four foundations.',
    tableNote: 'The first pass supports draw-one play with clear tableau, waste, stock, and foundation zones.',
  },
  blackjack: {
    id: 'blackjack',
    title: 'Blackjack-style',
    summary: 'Take cards toward 21, then let the house play to 17.',
    steps: [
      'TWIST takes another card; STICK keeps your current total.',
      'Aces count as 11 or 1 so the best total under 21 is used.',
      'After every real player sticks or busts, the house reveals and plays.',
    ],
    win: 'The closest non-bust hand beats the house. A bust loses the hand.',
    tableNote: 'Your hand value stays visible while the dealer seat remains the last seat.',
  },
  poker: {
    id: 'poker',
    title: "Texas Hold'em-style",
    summary: 'Post blinds, build the pot, and make the best five-card hand from the table.',
    steps: [
      'The hand opens with a 5-chip small blind and a 10-chip big blind.',
      'Use CHECK, CALL, RAISE, or FOLD until every live player has matched the bet.',
      'The table advances through BURN, FLOP, TURN, and RIVER before SHOWDOWN.',
      'At SHOWDOWN, the best five-card combination wins the pot.',
    ],
    win: 'The highest-ranked live hand takes the table; folding leaves the pot to the last live player.',
    tableNote: 'Each player starts with 100 chips. Private hole cards stay private; community cards are always public.',
  },
  freecell: {
    id: 'freecell',
    title: 'FreeCell',
    summary: 'Every card face-up. Build the foundations with four free cells.',
    steps: [
      'Tap a card, then tap a destination to move it.',
      'Stack columns in descending order, alternating red and black.',
      'Use the four free cells to hold single cards while you rearrange.',
      'Send Aces to the foundations, then build each suit up to King.',
    ],
    win: 'All 52 cards in the four foundations.',
    tableNote: 'You can move a run of cards if you have enough free cells and empty columns.',
  },
  pyramid: {
    id: 'pyramid',
    title: 'Pyramid Solitaire',
    summary: 'Pair cards to thirteen and dismantle the pyramid.',
    steps: [
      'Tap two free cards whose ranks add to thirteen (A=1, J=11, Q=12).',
      'A King (13) is removed on its own — just tap it.',
      'Only cards not covered by others are free to pair.',
      'Tap the stock to draw; pair waste cards with free pyramid cards.',
    ],
    win: 'Clear all 28 cards from the pyramid.',
    tableNote: 'The stock and waste are always available; pyramid cards must be uncovered.',
  },
};

export function getRulesGuide(presetId: string | null | undefined): RulesGuide {
  return RULES_GUIDES[presetId ?? 'freeplay'] ?? RULES_GUIDES.freeplay!;
}
