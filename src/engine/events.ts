import type {
  CardFace,
  CardId,
  PlayerId,
  PokerBetAction,
  SessionConfig,
  SessionMeta,
  Zone,
  ZoneId,
} from './types';

export interface BaseEvent {
  readonly id: string;
  readonly ts: number;
  readonly actorId: PlayerId | 'system';
  readonly seq: number;
}

export type GameEvent =
  | (BaseEvent & {
      type: 'session/start';
      meta: SessionMeta;
      config: SessionConfig;
      players: { id: PlayerId; name: string; seat: number; avatarSeed: string }[];
      zones: Zone[];
    })
  | (BaseEvent & { type: 'deck/shuffle'; zoneId: ZoneId; newOrder: CardId[] })
  | (BaseEvent & {
      type: 'card/deal';
      cardId: CardId;
      toZoneId: ZoneId;
      face: CardFace;
    })
  | (BaseEvent & {
      type: 'card/move';
      cardId: CardId;
      toZoneId: ZoneId;
      face?: CardFace;
      toIndex?: number;
    })
  | (BaseEvent & { type: 'card/flip'; cardId: CardId })
  | (BaseEvent & { type: 'card/peek'; cardId: CardId; byPlayerId: PlayerId })
  | (BaseEvent & {
      type: 'card/ask';
      targetPlayerId: PlayerId;
      rank: string;
      found: boolean;
      transferredCount: number;
    })
  | (BaseEvent & { type: 'card/reveal'; cardId: CardId })
  | (BaseEvent & {
      type: 'card/identify';
      cardId: CardId;
      realId: CardId;
    })
  | (BaseEvent & { type: 'hand/reorder'; playerId: PlayerId; order: CardId[] })
  | (BaseEvent & { type: 'turn/set'; playerId: PlayerId })
  | (BaseEvent & { type: 'turn/end'; playerId: PlayerId })
  | (BaseEvent & { type: 'privacy/enter'; playerId: PlayerId })
  | (BaseEvent & { type: 'privacy/exit' })
  | (BaseEvent & { type: 'game/street'; street: number })
  | (BaseEvent & { type: 'game/burn'; street: number })
  | (BaseEvent & {
      type: 'game/bet';
      playerId: PlayerId;
      action: PokerBetAction;
      amount: number;
      roundComplete?: boolean;
    })
  | (BaseEvent & { type: 'game/fold'; playerId: PlayerId })
  | (BaseEvent & { type: 'session/pause' })
  | (BaseEvent & { type: 'session/resume' })
  | (BaseEvent & { type: 'session/end'; winnerId?: PlayerId });

export type EventType = GameEvent['type'];

export function eventId(seq: number, sessionId = 'session'): string {
  return `${sessionId}:${seq}`;
}
