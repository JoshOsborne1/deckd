import {
  buildDeck,
  cardId,
  jokerId,
  makeSeed,
  mulberry32,
  shuffleInPlace,
} from './deck';

describe('deck builder', () => {
  it('builds 52 standard cards without jokers', () => {
    const deck = buildDeck({ includeJokers: false });
    expect(deck).toHaveLength(52);
    expect(deck.every((c) => c.kind === 'standard')).toBe(true);
  });

  it('adds two jokers when requested', () => {
    const deck = buildDeck({ includeJokers: true });
    expect(deck).toHaveLength(54);
    const jokers = deck.filter((c) => c.kind === 'joker');
    expect(jokers).toHaveLength(2);
  });

  it('produces unique card ids', () => {
    const deck = buildDeck({ includeJokers: true });
    const ids = new Set(deck.map((c) => c.id));
    expect(ids.size).toBe(54);
  });

  it('cardId and jokerId are stable', () => {
    expect(cardId('hearts', 'A')).toBe('H-A');
    expect(cardId('spades', '10')).toBe('S-10');
    expect(jokerId('red')).toBe('JK-RED');
    expect(jokerId('black')).toBe('JK-BLACK');
  });
});

describe('seeded shuffle', () => {
  it('is deterministic for the same seed', () => {
    const seed = 'test-seed-1';
    const a = shuffleInPlace([...Array.from({ length: 52 }, (_, i) => i)], mulberry32(seed));
    const b = shuffleInPlace([...Array.from({ length: 52 }, (_, i) => i)], mulberry32(seed));
    expect(a).toEqual(b);
  });

  it('differs for different seeds', () => {
    const a = shuffleInPlace([...Array.from({ length: 52 }, (_, i) => i)], mulberry32('seed-a'));
    const b = shuffleInPlace([...Array.from({ length: 52 }, (_, i) => i)], mulberry32('seed-b'));
    expect(a).not.toEqual(b);
  });

  it('is a permutation (no duplicates, no losses)', () => {
    const input = Array.from({ length: 52 }, (_, i) => i);
    const out = shuffleInPlace(input.slice(), mulberry32(makeSeed()));
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });
});
