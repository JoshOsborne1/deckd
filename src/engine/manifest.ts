import type { CardId, GameState, PlayerId, ZoneId } from './types';
import type { GameEvent } from './events';
import { eventId } from './events';
import type { DeckDefinition } from './visuals';

export type SetupOp =
  | { kind: 'createZone'; id: ZoneId; label: string; visibility: 'public' | 'hidden'; ownerId?: PlayerId }
  | { kind: 'deal'; count: number; toZoneId: ZoneId; face: 'up' | 'down' }
  | { kind: 'burn'; count: number; toZoneId: ZoneId }
  | { kind: 'move'; cardId: CardId; toZoneId: ZoneId; index?: number }
  | { kind: 'reveal'; cardId: CardId }
  | { kind: 'assignRole'; playerId: PlayerId; role: string }
  | { kind: 'setTurn'; playerId: PlayerId }
  | { kind: 'createCounter'; id: string; label: string; initial: number };

export interface ZoneTemplate {
  id: ZoneId;
  label: string;
  visibility: 'public' | 'hidden';
  ownerId?: PlayerId;
}

export interface ActionManifest {
  id: string;
  label: string;
  /** Whether this action is available to the actor in the current state */
  guard: (state: GameState, actorId: PlayerId) => boolean;
  /** Execute the action and return resulting events */
  effect: (context: ActionContext) => GameEvent[];
  /** UI hint for where/how to show this action */
  uiHint: 'hand' | 'table' | 'modal' | 'bottomBar';
}

export interface ActionContext {
  state: GameState;
  actorId: PlayerId;
  /** Selected card IDs when the action is triggered from a selection */
  selectedCardIds?: CardId[];
  /** Target zone when applicable */
  targetZoneId?: ZoneId;
}

export interface TableLayoutHints {
  /** Show opponent avatars in a ring */
  opponentRing: boolean;
  /** Show draw/discard piles prominently */
  deckPiles: boolean;
  /** Show communal/shared zones */
  communalZones: boolean;
  /** Action bar style */
  actionBar: 'contextual' | 'persistent' | 'minimal';
  /** Hand position: bottom-fan, bottom-stack, or hidden */
  handPosition: 'bottomFan' | 'bottomStack' | 'hidden';
}

export interface GamePresetManifest {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
  deckId: string;
  zones: ZoneTemplate[];
  setup: SetupOp[];
  actions: ActionManifest[];
  ui: TableLayoutHints;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate a preset manifest for structural correctness */
export function validateManifest(
  manifest: GamePresetManifest,
  knownDecks: DeckDefinition[],
): ManifestValidationResult {
  const errors: string[] = [];

  if (!manifest.id || manifest.id.trim().length === 0) {
    errors.push('Manifest id is required');
  }
  if (!manifest.name || manifest.name.trim().length === 0) {
    errors.push('Manifest name is required');
  }
  if (manifest.minPlayers < 1) {
    errors.push('minPlayers must be at least 1');
  }
  if (manifest.maxPlayers < manifest.minPlayers) {
    errors.push('maxPlayers must be >= minPlayers');
  }

  const deckExists = knownDecks.some((d) => d.id === manifest.deckId);
  if (!deckExists) {
    errors.push(`Unknown deckId: ${manifest.deckId}`);
  }

  const zoneIds = new Set<ZoneId>();
  for (const z of manifest.zones) {
    if (zoneIds.has(z.id)) {
      errors.push(`Duplicate zone id: ${z.id}`);
    }
    zoneIds.add(z.id);
  }

  for (const op of manifest.setup) {
    if (op.kind === 'deal' || op.kind === 'burn') {
      if (!zoneIds.has(op.toZoneId) && op.toZoneId !== 'draw' && op.toZoneId !== 'discard' && op.toZoneId !== 'muck') {
        errors.push(`Setup op ${op.kind} references unknown zone: ${op.toZoneId}`);
      }
    }
    if (op.kind === 'move') {
      if (!zoneIds.has(op.toZoneId) && op.toZoneId !== 'draw' && op.toZoneId !== 'discard' && op.toZoneId !== 'muck') {
        errors.push(`Setup op move references unknown zone: ${op.toZoneId}`);
      }
    }
  }

  const actionIds = new Set<string>();
  for (const a of manifest.actions) {
    if (actionIds.has(a.id)) {
      errors.push(`Duplicate action id: ${a.id}`);
    }
    actionIds.add(a.id);
  }

  return { valid: errors.length === 0, errors };
}

/** Compile a manifest's setup ops into a sequence of GameEvents for session initialization */
export function compileSetupOps(
  manifest: GamePresetManifest,
  players: { id: PlayerId; name: string; seat: number; avatarSeed: string }[],
  deckCards: CardId[],
  rng: () => number,
): GameEvent[] {
  const events: GameEvent[] = [];
  const meta = {
    id: `session-${Date.now()}`,
    createdAt: Date.now(),
    rngSeed: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    mode: 'pass' as const,
    hostId: players[0]?.id ?? '',
  };

  events.push({
    type: 'session/start',
    id: eventId(0),
    ts: Date.now(),
    actorId: 'system',
    seq: 0,
    meta,
    config: { includeJokers: false, fanStyle: 'wide', autoReshuffleDiscard: true, presetId: manifest.id },
    players: players.map((p) => ({ ...p })),
    zones: manifest.zones.map((z) => ({
      id: z.id,
      label: z.label,
      visibility: z.visibility === 'public' ? { kind: 'public' as const } : { kind: 'hidden' as const },
      ownerId: z.ownerId,
      cardIds: [],
    })),
  });

  let remainingDeck = deckCards.slice();
  for (const op of manifest.setup) {
    switch (op.kind) {
      case 'deal': {
        const count = Math.min(op.count, remainingDeck.length);
        for (let i = 0; i < count; i++) {
          const cardId = remainingDeck.shift();
          if (!cardId) break;
          events.push({
            type: 'card/deal',
            id: eventId(events.length),
            ts: Date.now(),
            actorId: 'system',
            seq: events.length,
            cardId,
            toZoneId: op.toZoneId,
            face: op.face,
          });
        }
        break;
      }
      case 'burn': {
        const count = Math.min(op.count, remainingDeck.length);
        for (let i = 0; i < count; i++) {
          const cardId = remainingDeck.shift();
          if (!cardId) break;
          events.push({
            type: 'card/move',
            id: eventId(events.length),
            ts: Date.now(),
            actorId: 'system',
            seq: events.length,
            cardId,
            toZoneId: op.toZoneId,
          });
        }
        break;
      }
      case 'setTurn': {
        events.push({
          type: 'turn/set',
          id: eventId(events.length),
          ts: Date.now(),
          actorId: 'system',
          seq: events.length,
          playerId: op.playerId,
        });
        break;
      }
      default:
        // Other ops are data-only and don't produce events directly
        break;
    }
  }

  return events;
}
