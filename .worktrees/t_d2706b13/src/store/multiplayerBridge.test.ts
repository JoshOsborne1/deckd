/**
 * Multiplayer bridge integration test.
 *
 * Drives the real multiplayerBridge through mocked relay sessions, exercising
 * the full host-broadcast → guest-fold loop with real zustand stores. This
 * replaces the two-browser manual verification with an automated simulation
 * through the actual bridge wiring.
 */

import { useGameStore } from '@store/gameStore';
import { useLobbyStore } from '@store/lobbyStore';
import {
  installMultiplayerBridge,
  resetBridge,
  getLastBroadcastSeq,
} from '@store/multiplayerBridge';
import {
  selectDrawPileCount,
  selectDiscardTopCard,
  selectLocalHand,
} from '@engine/selectors';
import { ZONE_DISCARD, ZONE_DRAW, handZoneId } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { RelaySession } from '@lib/relayTransport';
import type { RelayPlayerInfo } from '@lib/relayProtocol';

// --- Mock platform storage so gameStore doesn't pull in react-native ---

jest.mock('@lib/storage', () => ({
  createPlatformStorage: () => ({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  }),
}));

// --- Mock relay transport: capture sent events + intents, let us relay ---

let hostSentEvents: GameEvent[][] = [];
let hostSentTo: { clientId: string; events: GameEvent[] }[] = [];
let guestSentIntents: { intent: string; payload: unknown }[] = [];
let hostCallbacks: {
  onOpen?: (s: RelaySession) => void;
  onEventsReceived?: (e: GameEvent[]) => void;
  onIntentReceived?: (i: string, p: unknown, f?: string) => void;
  onPlayersChanged?: (p: RelayPlayerInfo[]) => void;
  onClose?: () => void;
  onError?: (e: Error) => void;
} = {};
let guestCallbacks: typeof hostCallbacks = {};

jest.mock('@lib/relayTransport', () => ({
  createRelaySession: jest.fn((opts: {
    role: 'host' | 'guest';
    roomCode: string;
    clientId: string;
    nickname: string;
    callbacks: typeof hostCallbacks;
  }) => {
    const cb = opts.callbacks;
    if (opts.role === 'host') {
      hostCallbacks = cb;
      hostSentEvents = [];
      hostSentTo = [];
      const session: RelaySession = {
        role: 'host',
        roomCode: opts.roomCode,
        players: [],
        status: 'connected',
        lastError: null,
        sendEvents: jest.fn(async (events: GameEvent[]) => {
          hostSentEvents.push(events);
        }),
        sendEventsTo: jest.fn(async (clientId: string, events: GameEvent[]) => {
          hostSentTo.push({ clientId, events });
        }),
        sendIntent: jest.fn(async () => {
          throw new Error('Only guests send intents');
        }),
        requestSnapshot: jest.fn(),
        close: jest.fn(),
      };
      return session;
    }
    guestCallbacks = cb;
    guestSentIntents = [];
    const guestSession: RelaySession = {
      role: 'guest',
      roomCode: opts.roomCode,
      players: [],
      status: 'connected',
      lastError: null,
      sendEvents: jest.fn(async () => {
        throw new Error('Only the host broadcasts events');
      }),
      sendIntent: jest.fn(async (intent: string, payload: unknown) => {
        guestSentIntents.push({ intent, payload });
      }),
      requestSnapshot: jest.fn(),
      close: jest.fn(),
    };
    return guestSession;
  }),
  getRelayUrl: jest.fn(() => 'ws://127.0.0.1:8080'),
}));

function resetStores() {
  useGameStore.getState().resetSession();
  useLobbyStore.setState({
    session: null,
    status: 'idle',
    roomCode: '',
    players: [],
    lastError: null,
    localClientId: '',
  });
  useLobbyStore.getState().registerGameSyncHandlers({});
}

beforeEach(() => {
  resetBridge();
  resetStores();
  hostSentEvents = [];
  hostSentTo = [];
  guestSentIntents = [];
  hostCallbacks = {};
  guestCallbacks = {};
});

describe('multiplayerBridge', () => {
  it('host broadcasts session-start events after createSession', () => {
    installMultiplayerBridge();

    // Host opens a lobby.
    useLobbyStore.getState().hostLobby('Alice');
    const hostSession = useLobbyStore.getState().session!;
    // Simulate relay connect.
    hostCallbacks.onOpen?.(hostSession);
    hostCallbacks.onPlayersChanged?.([
      { clientId: useLobbyStore.getState().localClientId, nickname: 'Alice', isHost: true, joinedAt: 1 },
      { clientId: 'guest-cid', nickname: 'Bob', isHost: false, joinedAt: 2 },
    ]);

    // Host creates a session with the relay roster.
    const hostCid = useLobbyStore.getState().localClientId;
    useGameStore.getState().createSession({
      mode: 'online-host',
      presetId: 'freeplay',
      players: [
        { id: hostCid, name: 'Alice', avatarSeed: hostCid },
        { id: 'guest-cid', name: 'Bob', avatarSeed: 'guest-cid' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: hostCid,
    });

    // The bridge should have sent the session-start + deal events to the guest.
    expect(hostSentTo.length).toBeGreaterThan(0);
    const guestBatch = hostSentTo.find((s) => s.clientId === 'guest-cid');
    expect(guestBatch).toBeDefined();
    expect(guestBatch!.events.length).toBeGreaterThan(0);
    expect(guestBatch!.events[0]!.type).toBe('session/start');
    expect(getLastBroadcastSeq()).toBeGreaterThan(0);
  });

  it('guest folds received events and mirrors host state', () => {
    installMultiplayerBridge();

    // Host side.
    useLobbyStore.getState().hostLobby('Alice');
    const hostSession = useLobbyStore.getState().session!;
    const hostCid = useLobbyStore.getState().localClientId;
    hostCallbacks.onOpen?.(hostSession);
    hostCallbacks.onPlayersChanged?.([
      { clientId: hostCid, nickname: 'Alice', isHost: true, joinedAt: 1 },
      { clientId: 'guest-cid', nickname: 'Bob', isHost: false, joinedAt: 2 },
    ]);

    // Host creates a session before the guest joins so we can capture the
    // real recipient-filtered opening batch.
    useGameStore.getState().createSession({
      mode: 'online-host',
      presetId: 'freeplay',
      players: [
        { id: hostCid, name: 'Alice', avatarSeed: hostCid },
        { id: 'guest-cid', name: 'Bob', avatarSeed: 'guest-cid' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: hostCid,
    });

    const broadcastEvents = hostSentTo.find((s) => s.clientId === 'guest-cid')?.events ?? [];

    // Guest side: join + connect.
    useLobbyStore.getState().joinLobby('TEST01', 'Bob');
    const guestSession = useLobbyStore.getState().session!;
    guestCallbacks.onOpen?.(guestSession);

    // Guest should have requested a snapshot on connect.
    expect(guestSentIntents.some((i) => i.intent === 'request_snapshot')).toBe(true);

    // Fold the host batch into a cold guest store.
    useGameStore.getState().resetSession();
    guestCallbacks.onEventsReceived?.(broadcastEvents);

    // Guest's gameStore should now mirror the host's.
    const guestGameState = useGameStore.getState().state;
    expect(guestGameState.phase).toBe('playing');
    expect(guestGameState.meta.mode).toBe('online-guest');
    expect(guestGameState.players).toHaveLength(2);
    expect(selectDrawPileCount(guestGameState)).toBe(52);
  });

  it('host applies guest draw_card intent and broadcasts the new event', () => {
    installMultiplayerBridge();

    useLobbyStore.getState().hostLobby('Alice');
    const hostSession = useLobbyStore.getState().session!;
    const hostCid = useLobbyStore.getState().localClientId;
    hostCallbacks.onOpen?.(hostSession);
    hostCallbacks.onPlayersChanged?.([
      { clientId: hostCid, nickname: 'Alice', isHost: true, joinedAt: 1 },
      { clientId: 'guest-cid', nickname: 'Bob', isHost: false, joinedAt: 2 },
    ]);

    useGameStore.getState().createSession({
      mode: 'online-host',
      presetId: 'freeplay',
      players: [
        { id: hostCid, name: 'Alice', avatarSeed: hostCid },
        { id: 'guest-cid', name: 'Bob', avatarSeed: 'guest-cid' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: hostCid,
    });

    hostSentTo = []; // clear the session-start broadcast

    // Guest must be the current player. Host is player 0, so first end the
    // host's turn to make the guest current.
    useGameStore.getState().endTurn(hostCid);
    hostSentTo = []; // clear the turn/end broadcast

    // Now the guest is the current player. Simulate the guest's draw intent
    // arriving at the host.
    hostCallbacks.onIntentReceived?.('draw_card', {}, 'guest-cid');

    // The host should have applied the draw and sent a new event to the guest.
    expect(hostSentTo.length).toBeGreaterThan(0);
    const lastBatch = hostSentTo[hostSentTo.length - 1]!.events;
    const drawEvent = lastBatch.find((e) => e.type === 'card/deal');
    expect(drawEvent).toBeDefined();
    expect(drawEvent!.toZoneId).toBe(handZoneId('guest-cid'));
  });

  it('ignores guest hand intents outside the active turn', () => {
    installMultiplayerBridge();

    useLobbyStore.getState().hostLobby('Alice');
    const hostSession = useLobbyStore.getState().session!;
    const hostCid = useLobbyStore.getState().localClientId;
    hostCallbacks.onOpen?.(hostSession);
    hostCallbacks.onPlayersChanged?.([
      { clientId: hostCid, nickname: 'Alice', isHost: true, joinedAt: 1 },
      { clientId: 'guest-cid', nickname: 'Bob', isHost: false, joinedAt: 2 },
    ]);

    useGameStore.getState().createSession({
      mode: 'online-host',
      presetId: 'freeplay',
      players: [
        { id: hostCid, name: 'Alice', avatarSeed: hostCid },
        { id: 'guest-cid', name: 'Bob', avatarSeed: 'guest-cid' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: hostCid,
    });

    const guestCardId = useGameStore.getState().state.zones[ZONE_DRAW]!.cardIds[0]!;
    useGameStore.getState().dealCard(guestCardId, handZoneId('guest-cid'), 'down');
    const before = useGameStore.getState().state;
    const faceBefore = before.cards[guestCardId]!.face;
    hostSentTo = [];

    // Host still owns the active turn; guest gestures must be inert.
    hostCallbacks.onIntentReceived?.('flip_card', { cardId: guestCardId }, 'guest-cid');
    hostCallbacks.onIntentReceived?.(
      'move_card',
      { cardId: guestCardId, toZoneId: ZONE_DRAW, face: 'up' },
      'guest-cid',
    );

    const after = useGameStore.getState().state;
    expect(after.cards[guestCardId]!.face).toBe(faceBefore);
    expect(after.zones[handZoneId('guest-cid')]!.cardIds).toContain(guestCardId);
    expect(hostSentTo).toHaveLength(0);
  });

  it('only accepts a current player discard intent into the public discard zone', () => {
    installMultiplayerBridge();

    useLobbyStore.getState().hostLobby('Alice');
    const hostSession = useLobbyStore.getState().session!;
    const hostCid = useLobbyStore.getState().localClientId;
    hostCallbacks.onOpen?.(hostSession);
    hostCallbacks.onPlayersChanged?.([
      { clientId: hostCid, nickname: 'Alice', isHost: true, joinedAt: 1 },
      { clientId: 'guest-cid', nickname: 'Bob', isHost: false, joinedAt: 2 },
    ]);

    useGameStore.getState().createSession({
      mode: 'online-host',
      presetId: 'freeplay',
      players: [
        { id: hostCid, name: 'Alice', avatarSeed: hostCid },
        { id: 'guest-cid', name: 'Bob', avatarSeed: 'guest-cid' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: hostCid,
    });

    const guestCardId = useGameStore.getState().state.zones[ZONE_DRAW]!.cardIds[0]!;
    useGameStore.getState().dealCard(guestCardId, handZoneId('guest-cid'), 'down');
    useGameStore.getState().endTurn(hostCid);
    hostSentTo = [];

    hostCallbacks.onIntentReceived?.(
      'move_card',
      { cardId: guestCardId, toZoneId: ZONE_DRAW, face: 'up' },
      'guest-cid',
    );

    expect(useGameStore.getState().state.zones[handZoneId('guest-cid')]!.cardIds).toContain(guestCardId);
    expect(hostSentTo).toHaveLength(0);

    hostCallbacks.onIntentReceived?.(
      'move_card',
      { cardId: guestCardId, toZoneId: ZONE_DISCARD, face: 'down' },
      'guest-cid',
    );

    expect(useGameStore.getState().state.zones[ZONE_DISCARD]!.cardIds).toContain(guestCardId);
    expect(useGameStore.getState().state.cards[guestCardId]!.face).toBe('up');
  });

  it('pass-and-play with no relay: bridge is inert, gameStore works normally', () => {
    installMultiplayerBridge();

    // No relay session at all — pure pass-and-play.
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'freeplay',
      players: [
        { id: 'you', name: 'You', avatarSeed: 'seed' },
        { id: 'p2', name: 'Player 2', avatarSeed: 'seed2' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: 'you',
    });

    // No broadcast should have happened (no relay session).
    expect(hostSentTo).toHaveLength(0);

    // Game state should be fine.
    const state = useGameStore.getState().state;
    expect(state.phase).toBe('playing');
    expect(selectDrawPileCount(state)).toBe(52);

    // Draw a card locally.
    const topId = state.zones[ZONE_DRAW]!.cardIds[0]!;
    useGameStore.getState().dealCard(topId, handZoneId('you'), 'up');

    const afterDraw = useGameStore.getState().state;
    expect(selectDrawPileCount(afterDraw)).toBe(51);
    expect(selectLocalHand(afterDraw, 'you')).toHaveLength(1);
  });

  it('replaySession starts a fresh poker hand after showdown/fold end', () => {
    useGameStore.getState().createSession({
      mode: 'pass',
      presetId: 'poker',
      players: [
        { id: 'you', name: 'You', avatarSeed: 'seed' },
        { id: 'p2', name: 'Player 2', avatarSeed: 'seed2' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: 'you',
    });

    const firstHandId = useGameStore.getState().state.meta.id;
    expect(useGameStore.getState().state.game?.pot).toBe(15);
    expect(useGameStore.getState().state.game?.street).toBe(0);

    // Folding the first player ends the heads-up hand and exercises the same
    // session/end path used by the showdown action.
    expect(useGameStore.getState().gameAction('fold', 'you')).toBe(true);
    expect(useGameStore.getState().state.phase).toBe('ended');

    useGameStore.getState().replaySession();

    const replayed = useGameStore.getState().state;
    expect(replayed.phase).toBe('playing');
    expect(replayed.meta.id).not.toBe(firstHandId);
    expect(replayed.game?.street).toBe(0);
    expect(replayed.game?.pot).toBe(15);
    expect(replayed.game?.folded).toEqual([]);
    expect(selectLocalHand(replayed, 'you')).toHaveLength(2);
    expect(selectLocalHand(replayed, 'p2')).toHaveLength(2);
  });

  it('card moves propagate to guest: discard top mirrors host', () => {
    installMultiplayerBridge();

    // Setup host + guest like the mirror test.
    useLobbyStore.getState().hostLobby('Alice');
    const hostSession = useLobbyStore.getState().session!;
    const hostCid = useLobbyStore.getState().localClientId;
    hostCallbacks.onOpen?.(hostSession);
    useLobbyStore.getState().joinLobby('TEST02', 'Bob');
    const guestSession = useLobbyStore.getState().session!;
    guestCallbacks.onOpen?.(guestSession);

    useGameStore.getState().createSession({
      mode: 'online-host',
      presetId: 'freeplay',
      players: [
        { id: hostCid, name: 'Alice', avatarSeed: hostCid },
        { id: 'guest-cid', name: 'Bob', avatarSeed: 'guest-cid' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: hostCid,
    });

    // Relay the session to the guest.
    guestCallbacks.onEventsReceived?.(hostSentTo.flatMap((s) => s.events));

    // Host moves a card to discard.
    const drawTop = useGameStore.getState().state.zones[ZONE_DRAW]!.cardIds[0]!;
    hostSentTo = [];
    useGameStore.getState().moveCard(drawTop, ZONE_DISCARD, 'up');

    // Relay the move event to the guest.
    guestCallbacks.onEventsReceived?.(hostSentTo.flatMap((s) => s.events));

    // Guest's discard top should match the host's.
    const guestDiscard = selectDiscardTopCard(useGameStore.getState().state);
    expect(guestDiscard).not.toBeNull();
    expect(guestDiscard!.id).toBe(drawTop);
    expect(guestDiscard!.face).toBe('up');
  });

  it('privacy gate: guest cannot flip another player hidden card', () => {
    installMultiplayerBridge();

    useLobbyStore.getState().hostLobby('Alice');
    const hostSession = useLobbyStore.getState().session!;
    const hostCid = useLobbyStore.getState().localClientId;
    hostCallbacks.onOpen?.(hostSession);
    hostCallbacks.onPlayersChanged?.([
      { clientId: hostCid, nickname: 'Alice', isHost: true, joinedAt: 1 },
      { clientId: 'guest-cid', nickname: 'Bob', isHost: false, joinedAt: 2 },
    ]);

    useGameStore.getState().createSession({
      mode: 'online-host',
      presetId: 'freeplay',
      players: [
        { id: hostCid, name: 'Alice', avatarSeed: hostCid },
        { id: 'guest-cid', name: 'Bob', avatarSeed: 'guest-cid' },
      ],
      config: { includeJokers: false, fanStyle: 'wide' },
      hostId: hostCid,
    });

    // Deal a card into the HOST's hand — hidden from the guest.
    const drawTop = useGameStore.getState().state.zones[ZONE_DRAW]!.cardIds[0]!;
    useGameStore.getState().dealCard(drawTop, handZoneId(hostCid), 'down');
    const hostHand = useGameStore.getState().state.zones[handZoneId(hostCid)]!;
    expect(hostHand.cardIds.length).toBeGreaterThan(0);
    const hostCardId = hostHand.cardIds[0]!;
    const faceBefore = useGameStore.getState().state.cards[hostCardId]!.face;

    hostSentTo = [];

    // Malicious guest tries to flip the host's hidden card.
    hostCallbacks.onIntentReceived?.(
      'flip_card',
      { cardId: hostCardId },
      'guest-cid',
    );

    // The card must be untouched and nothing broadcast.
    const faceAfter = useGameStore.getState().state.cards[hostCardId]!.face;
    expect(faceAfter).toBe(faceBefore);
    expect(hostSentTo).toHaveLength(0);
  });
});