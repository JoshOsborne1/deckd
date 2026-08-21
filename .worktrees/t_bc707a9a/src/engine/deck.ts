import type { Rank, Suit } from '@lib/types';
import type { DeckCard } from './types';

const SUITS: readonly Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
const RANKS: readonly Rank[] = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

const SUIT_GLYPH: Record<Suit, string> = {
  hearts: 'H',
  diamonds: 'D',
  spades: 'S',
  clubs: 'C',
};

export function cardId(suit: Suit, rank: Rank): string {
  return `${SUIT_GLYPH[suit]}-${rank}`;
}

export function jokerId(color: 'red' | 'black'): string {
  return `JK-${color.toUpperCase()}`;
}

export function buildDeck(options: { includeJokers: boolean }): DeckCard[] {
  const deck: DeckCard[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: cardId(suit, rank), kind: 'standard', rank, suit });
    }
  }
  if (options.includeJokers) {
    deck.push({ id: jokerId('red'), kind: 'joker', color: 'red' });
    deck.push({ id: jokerId('black'), kind: 'joker', color: 'black' });
  }
  return deck;
}

// Deterministic PRNG (mulberry32). Same seed → same shuffle across devices.
export function mulberry32(seedString: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedString.length; i += 1) {
    h = Math.imul(h ^ seedString.charCodeAt(i), 16777619);
  }
  let a = h >>> 0;
  return function prng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function makeSeed(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const DECK_SUITS = SUITS;
export const DECK_RANKS = RANKS;
