import type { GameEvent } from '@engine/events';

/** One-line summary for the event log UI (debug + history modal). */
export function formatGameEventLine(e: GameEvent): string {
  const head = `#${e.seq}`;
  switch (e.type) {
    case 'session/start':
      return `${head} session/start · ${e.meta.mode} · ${e.players.length}P · ${e.config.presetId ?? '—'}`;
    case 'deck/shuffle':
      return `${head} deck/shuffle · ${e.zoneId} · n=${e.newOrder.length}`;
    case 'card/deal':
      return `${head} card/deal · ${e.cardId} → ${e.toZoneId} (${e.face})`;
    case 'card/move':
      return `${head} card/move · ${e.cardId} → ${e.toZoneId}`;
    case 'card/flip':
      return `${head} card/flip · ${e.cardId}`;
    case 'card/peek':
      return `${head} card/peek · ${e.cardId}`;
    case 'card/reveal':
      return `${head} card/reveal · ${e.cardId}`;
    case 'hand/reorder':
      return `${head} hand/reorder · ${e.playerId} · n=${e.order.length}`;
    case 'turn/set':
      return `${head} turn/set · ${e.playerId}`;
    case 'turn/end':
      return `${head} turn/end · ${e.playerId}`;
    case 'privacy/enter':
      return `${head} privacy/enter · ${e.playerId}`;
    case 'privacy/exit':
      return `${head} privacy/exit`;
    case 'session/pause':
      return `${head} session/pause`;
    case 'session/resume':
      return `${head} session/resume`;
    case 'session/end':
      return `${head} session/end · winner=${e.winnerId ?? '—'}`;
    default: {
      const _exhaustive: never = e;
      return `${head} ${String(_exhaustive)}`;
    }
  }
}
