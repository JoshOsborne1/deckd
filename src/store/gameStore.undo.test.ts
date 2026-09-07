import { useGameStore } from './gameStore';

// Mock platform storage: gameStore persists via createPlatformStorage which
// imports react-native. An in-memory map keeps it testable in the node env.
const storageMap = new Map<string, string>();
jest.mock('@lib/storage', () => ({
  createPlatformStorage: jest.fn(() => ({
    getItem: (name: string) => storageMap.get(name) ?? null,
    setItem: (name: string, value: string) => {
      storageMap.set(name, value);
    },
    removeItem: (name: string) => {
      storageMap.delete(name);
    },
  })),
}));

/**
 * Undo tests for the gameStore event-log rewind.
 *
 * These exercise the store action directly (not the selector). The store
 * creates a real freeplay session, dispatches reversible events, then undoes
 * them one at a time and asserts the folded state matches a pre-event state.
 */
function createFreeplaySession(): void {
  useGameStore.getState().createSession({
    mode: 'pass',
    presetId: 'freeplay',
    players: [
      { id: 'p1', name: 'One', avatarSeed: 's1' },
      { id: 'p2', name: 'Two', avatarSeed: 's2' },
    ],
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true },
  });
}

describe('gameStore undoLastAction', () => {
  beforeEach(() => {
    useGameStore.setState({ events: [], seq: 0, state: useGameStore.getState().state });
    createFreeplaySession();
  });

  it('undoes a card draw (card/deal from draw to hand)', () => {
    const store = useGameStore.getState();
    const drawTopBefore = store.state.zones['draw']?.cardIds[0] ?? null;
    const handCountBefore = store.state.zones['hand:p1']?.cardIds.length ?? 0;

    // Draw a card.
    store.dealCard(drawTopBefore!, 'hand:p1', 'up');
    const afterDraw = useGameStore.getState();
    expect(afterDraw.state.zones['hand:p1']?.cardIds.length).toBe(handCountBefore + 1);

    // Undo it.
    const result = useGameStore.getState().undoLastAction();
    expect(result).toBe(true);

    const afterUndo = useGameStore.getState();
    expect(afterUndo.state.zones['hand:p1']?.cardIds.length).toBe(handCountBefore);
    expect(afterUndo.state.zones['draw']?.cardIds[0]).toBe(drawTopBefore);
  });

  it('undoes a card discard (card/move to discard)', () => {
    const store = useGameStore.getState();
    const drawTop = store.state.zones['draw']?.cardIds[0] ?? null;
    store.dealCard(drawTop!, 'hand:p1', 'up');
    const handCard = useGameStore.getState().state.zones['hand:p1']?.cardIds[0] ?? null;

    // Discard the card.
    store.moveCard(handCard!, 'discard', 'up');
    const afterDiscard = useGameStore.getState();
    expect(afterDiscard.state.zones['discard']?.cardIds.length).toBe(1);

    // Undo it.
    useGameStore.getState().undoLastAction();
    const afterUndo = useGameStore.getState();
    expect(afterUndo.state.zones['discard']?.cardIds.length).toBe(0);
    expect(afterUndo.state.zones['hand:p1']?.cardIds.length).toBe(1);
  });

  it('undoes a card flip', () => {
    const store = useGameStore.getState();
    const drawTop = store.state.zones['draw']?.cardIds[0] ?? null;
    store.dealCard(drawTop!, 'hand:p1', 'down');
    const handCard = useGameStore.getState().state.zones['hand:p1']?.cardIds[0] ?? null;
    const cardBeforeFlip = useGameStore.getState().state.cards[handCard!];

    // Flip the card.
    store.flipCard(handCard!);
    const afterFlip = useGameStore.getState();
    expect(afterFlip.state.cards[handCard!]?.face).toBe('up');

    // Undo it — the card should be face-down again.
    useGameStore.getState().undoLastAction();
    const afterUndo = useGameStore.getState();
    expect(afterUndo.state.cards[handCard!]?.face).toBe(cardBeforeFlip?.face);
  });

  it('does not undo across a turn boundary', () => {
    const store = useGameStore.getState();
    const drawTop = store.state.zones['draw']?.cardIds[0] ?? null;
    store.dealCard(drawTop!, 'hand:p1', 'up');

    // End the turn (turn boundary).
    store.endTurn('p1');
    const afterTurn = useGameStore.getState();
    expect(afterTurn.state.currentPlayerId).toBe('p2');

    // Undo should not cross the turn boundary.
    const result = useGameStore.getState().undoLastAction();
    // The selector allows undo for p2, but the event log has a turn/end
    // blocking the rewind. The store finds no reversible event before the
    // turn/end, so it returns false.
    expect(result).toBe(false);
  });

  it('returns false for blackjack (not freeplay-family)', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'blackjack',
      players: [
        { id: 'p1', name: 'One', avatarSeed: 's1' },
        { id: 'house', name: 'House', avatarSeed: 'house' },
      ],
      config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true },
    });
    const result = useGameStore.getState().undoLastAction();
    expect(result).toBe(false);
  });

  it('returns false when there is nothing to undo', () => {
    // Fresh session, no post-setup events.
    const result = useGameStore.getState().undoLastAction();
    expect(result).toBe(false);
  });

  it('caps the event log and stays fold-correct through the store', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'freeplay',
      players: [
        { id: 'p1', name: 'One', avatarSeed: 's1' },
        { id: 'p2', name: 'Two', avatarSeed: 's2' },
      ],
      config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true },
    });
    const setupCount = useGameStore.getState().events.length;

    // Pump enough valid dispatches to force compaction (default keep = 500).
    for (let i = 0; i < 505; i += 1) {
      useGameStore.getState().endTurn(useGameStore.getState().state.currentPlayerId!);
    }
    const after = useGameStore.getState();
    // Log is capped exactly at the keep budget.
    expect(after.events.length).toBe(500);
    // The tail still folds into the same playing state (baseline + events).
    expect(after.state.phase).toBe('playing');
    expect(after.eventBaseState).not.toBeNull();
    expect(after.seq).toBe(setupCount + 505);
    // currentPlayerId reflects all 505 applied turn/ends, not a truncated fold.
    expect(after.state.turn).toBe(505);
  });
});