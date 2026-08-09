import { buildDeck } from './deck';
import type { GameEvent } from './events';
import { applyEvent, foldEvents } from './state';
import {
  selectAvailableActions,
  selectGuidanceState,
  selectLocalHand,
  selectSuggestedAction,
} from './selectors';
import { handZoneId, ZONE_DISCARD, ZONE_DRAW, type GameState } from './types';

const players = [
  { id: 'p1', name: 'One', seat: 0, avatarSeed: 'seed-one' },
  { id: 'p2', name: 'Two', seat: 1, avatarSeed: 'seed-two' },
];

function baseEvent(seq: number, actorId: string = 'p1') {
  return { id: `selector-test-${seq}`, ts: seq, actorId, seq } as const;
}

function makeState(handFaces: ('up' | 'down')[] = [], drawCount?: number): GameState {
  const deckIds = buildDeck({ includeJokers: false }).map((card) => card.id);
  const start: GameEvent = {
    ...baseEvent(1),
    type: 'session/start',
    meta: {
      id: 'selector-test-session',
      createdAt: 1,
      rngSeed: 'selector-test-seed',
      mode: 'pass',
      hostId: 'p1',
    },
    config: {
      includeJokers: false,
      fanStyle: 'wide',
      autoReshuffleDiscard: true,
      presetId: 'freeplay',
    },
    players,
    zones: [
      {
        id: ZONE_DRAW,
        label: 'Draw pile',
        visibility: { kind: 'hidden' },
        cardIds: deckIds,
      },
      {
        id: ZONE_DISCARD,
        label: 'Discard',
        visibility: { kind: 'public' },
        cardIds: [],
      },
      {
        id: handZoneId('p1'),
        label: "One's hand",
        visibility: { kind: 'private', ownerId: 'p1' },
        ownerId: 'p1',
        cardIds: [],
      },
      {
        id: handZoneId('p2'),
        label: "Two's hand",
        visibility: { kind: 'private', ownerId: 'p2' },
        ownerId: 'p2',
        cardIds: [],
      },
    ],
  };

  const events: GameEvent[] = [start];
  handFaces.forEach((face, index) => {
    const cardId = deckIds[index]!;
    events.push({
      ...baseEvent(index + 2),
      type: 'card/move',
      cardId,
      toZoneId: handZoneId('p1'),
      face,
    });
  });

  const state = foldEvents(events);
  if (drawCount === undefined) return state;

  const draw = state.zones[ZONE_DRAW]!;
  return {
    ...state,
    zones: {
      ...state.zones,
      [ZONE_DRAW]: { ...draw, cardIds: draw.cardIds.slice(0, drawCount) },
    },
  };
}

describe('table action guidance selectors', () => {
  it('suggests drawing first while keeping pass, shuffle, and end available', () => {
    const state = makeState();
    const actions = selectAvailableActions(state, 'p1');

    expect(actions).toEqual(new Set(['draw', 'pass', 'shuffle', 'end']));
    expect(selectSuggestedAction(state, 'p1')).toBe('draw');
    expect(selectGuidanceState(state, 'p1')).toBe('draw');
  });

  it('exposes valid hand choices after a card is already in play', () => {
    const state = makeState(['up']);
    const actions = selectAvailableActions(state, 'p1');

    expect(actions).toEqual(new Set(['draw', 'flip', 'discard', 'pass', 'shuffle', 'end']));
    expect(selectSuggestedAction(state, 'p1')).toBe('discard');
    expect(selectGuidanceState(state, 'p1')).toBe('discard');
  });

  it('suggests revealing a dealt face-down hand before discarding it', () => {
    const state = makeState(['down', 'down']);

    expect(selectAvailableActions(state, 'p1')).toEqual(
      new Set(['draw', 'flip', 'discard', 'reorder', 'pass', 'shuffle', 'end']),
    );
    expect(selectSuggestedAction(state, 'p1')).toBe('flip');
    expect(selectGuidanceState(state, 'p1')).toBe('flip');
  });

  it('finds a flip recovery move when a face-down card is not first in hand order', () => {
    const state = makeState(['up', 'down']);

    expect(selectAvailableActions(state, 'p1')).toEqual(
      new Set(['draw', 'flip', 'discard', 'reorder', 'pass', 'shuffle', 'end']),
    );
    expect(selectSuggestedAction(state, 'p1')).toBe('flip');
    expect(selectGuidanceState(state, 'p1')).toBe('flip');
  });

  it('suggests passing when the draw pile is empty and the hand is empty', () => {
    const state = makeState([], 0);

    expect(selectAvailableActions(state, 'p1')).toEqual(new Set(['pass', 'end']));
    expect(selectSuggestedAction(state, 'p1')).toBe('pass');
    expect(selectGuidanceState(state, 'p1')).toBe('pass');
  });

  it('keeps a recovery choice after the last card is discarded', () => {
    const state = makeState(['up'], 0);
    const cardId = selectLocalHand(state, 'p1')[0]!.id;
    const recovered = applyEvent(state, {
      ...baseEvent(99),
      type: 'card/move',
      cardId,
      toZoneId: ZONE_DISCARD,
      face: 'up',
    });

    expect(selectAvailableActions(recovered, 'p1')).toEqual(new Set(['pass', 'end']));
    expect(selectSuggestedAction(recovered, 'p1')).toBe('pass');
  });

  it('does not offer turn actions to a player who is waiting', () => {
    const state = makeState(['up']);
    const afterPass = applyEvent(state, {
      ...baseEvent(100),
      type: 'turn/end',
      playerId: 'p1',
    });

    expect(afterPass.currentPlayerId).toBe('p2');
    expect(selectAvailableActions(afterPass, 'p1')).toEqual(new Set(['shuffle', 'end']));
    expect(selectSuggestedAction(afterPass, 'p1')).toBeNull();
    expect(selectGuidanceState(afterPass, 'p1')).toBe('waiting');
  });

  it('returns no actions after the session ends', () => {
    const ended: GameState = { ...makeState(), phase: 'ended' };

    expect(selectAvailableActions(ended, 'p1')).toEqual(new Set());
    expect(selectSuggestedAction(ended, 'p1')).toBeNull();
    expect(selectGuidanceState(ended, 'p1')).toBe('ended');
  });

  it('never suggests an action outside the currently available set', () => {
    const states = [
      makeState(),
      makeState(['up']),
      makeState(['down', 'down']),
      makeState([], 0),
      { ...makeState(), phase: 'ended' as const },
    ];

    for (const state of states) {
      const actions = selectAvailableActions(state, 'p1');
      const suggested = selectSuggestedAction(state, 'p1');
      if (suggested) expect(actions.has(suggested)).toBe(true);
    }
  });
});
