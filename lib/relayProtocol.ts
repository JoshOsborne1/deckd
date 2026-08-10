/**
 * Deckd relay wire protocol — WebSocket framing for cloud lobbies.
 *
 * Model: the server is a dumb pipe. The host is the source of truth.
 * Guests send intents to the host; the host broadcasts event batches to all.
 * The server only manages rooms, membership, and relay.
 */

export const RELAY_PROTOCOL_VERSION = 1;

/** 6-char room codes, unambiguous alphabet (no 0/O/1/I). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export interface RelayPlayerInfo {
  clientId: string;
  nickname: string;
  isHost: boolean;
  joinedAt: number;
}

// --- Client -> Server ---

export type RelayClientMessage =
  | { type: 'create_room'; clientId: string; nickname: string; masterToken?: string; roomCode?: string }
  | { type: 'join_room'; roomCode: string; clientId: string; nickname: string }
  | { type: 'leave_room' }
  | { type: 'relay'; to: 'host' | 'all'; payload: string }
  | { type: 'ping' };

// --- Server -> Client ---

export type RelayServerMessage =
  | { type: 'room_created'; roomCode: string; role: 'host'; players: RelayPlayerInfo[] }
  | { type: 'room_joined'; roomCode: string; role: 'guest'; players: RelayPlayerInfo[] }
  | { type: 'player_joined'; player: RelayPlayerInfo }
  | { type: 'player_left'; clientId: string; nickname: string }
  | { type: 'relay'; from: string; payload: string }
  | { type: 'room_closed' }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong' };

export function makeRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

export function parseRelayMessage(json: string): RelayClientMessage | RelayServerMessage | null {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== 'object' || !('type' in v)) return null;
    return v as RelayClientMessage | RelayServerMessage;
  } catch {
    return null;
  }
}
