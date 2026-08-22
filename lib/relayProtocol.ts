/**
 * Deckd relay wire protocol.
 *
 * Wire messages are flat JSON objects with a required protocol version. The
 * relay is intentionally dumb, but both ends validate the envelope and the
 * message shape before any stateful callback runs.
 */

export const RELAY_PROTOCOL_VERSION = 1;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;

export interface RelayPlayerInfo {
  clientId: string;
  nickname: string;
  isHost: boolean;
  joinedAt: number;
}

export type RelayClientMessage =
  | { type: 'create_room'; clientId: string; nickname: string; masterToken?: string; roomCode?: string; resumeToken?: string }
  | { type: 'join_room'; roomCode: string; clientId: string; nickname: string }
  | { type: 'leave_room' }
  | { type: 'relay'; to: 'host' | 'all' | string; payload: string }
  | { type: 'ping' };

export type RelayServerMessage =
  | { type: 'room_created'; roomCode: string; role: 'host'; players: RelayPlayerInfo[]; resumeToken: string }
  | { type: 'room_joined'; roomCode: string; role: 'guest'; players: RelayPlayerInfo[] }
  | { type: 'player_joined'; player: RelayPlayerInfo }
  | { type: 'player_left'; clientId: string; nickname: string }
  | { type: 'relay'; from: string; payload: string }
  | { type: 'room_closed' }
  | { type: 'error'; code: string; message: string; serverVersion: number }
  | { type: 'pong' };

type RelayWireMessage = (RelayClientMessage | RelayServerMessage) & { version: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPlayer(value: unknown): value is RelayPlayerInfo {
  if (!isRecord(value)) return false;
  return isString(value.clientId)
    && isString(value.nickname)
    && typeof value.isHost === 'boolean'
    && typeof value.joinedAt === 'number'
    && Number.isFinite(value.joinedAt);
}

function isPlayers(value: unknown): value is RelayPlayerInfo[] {
  return Array.isArray(value) && value.length <= 8 && value.every(isPlayer);
}

function isClientMessage(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case 'create_room':
      return isString(value.clientId)
        && value.clientId.length <= 128
        && isString(value.nickname)
        && value.nickname.length <= 24
        && (value.masterToken === undefined || isString(value.masterToken))
        && (value.roomCode === undefined || isString(value.roomCode))
        && (value.resumeToken === undefined || isString(value.resumeToken));
    case 'join_room':
      return isString(value.roomCode) && value.roomCode.length <= 12
        && isString(value.clientId) && value.clientId.length <= 128
        && isString(value.nickname) && value.nickname.length <= 24;
    case 'leave_room':
    case 'ping':
      return true;
    case 'relay':
      return isString(value.to) && value.to.length <= 128
        && isString(value.payload) && value.payload.length <= 256 * 1024;
    default:
      return false;
  }
}

function isServerMessage(value: Record<string, unknown>): boolean {
  switch (value.type) {
    case 'room_created':
      return value.role === 'host' && isString(value.roomCode)
        && isPlayers(value.players) && isString(value.resumeToken);
    case 'room_joined':
      return value.role === 'guest' && isString(value.roomCode) && isPlayers(value.players);
    case 'player_joined':
      return isPlayer(value.player);
    case 'player_left':
      return isString(value.clientId) && isString(value.nickname);
    case 'relay':
      return isString(value.from) && isString(value.payload) && value.payload.length <= 256 * 1024;
    case 'room_closed':
    case 'pong':
      return true;
    case 'error':
      return isString(value.code) && isString(value.message) && typeof value.serverVersion === 'number';
    default:
      return false;
  }
}

export function envelope<T extends RelayClientMessage | RelayServerMessage>(message: T): T & { version: number } {
  return { version: RELAY_PROTOCOL_VERSION, ...message };
}

export function isRelayServerMessage(message: RelayWireMessage): message is RelayServerMessage & { version: number } {
  return isServerMessage(message as unknown as Record<string, unknown>);
}

/** Return only validated, version-compatible wire messages. */
export function parseRelayMessage(json: string): RelayWireMessage | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!isRecord(parsed) || parsed.version !== RELAY_PROTOCOL_VERSION || !isString(parsed.type)) return null;
    if (!isClientMessage(parsed) && !isServerMessage(parsed)) return null;
    return parsed as RelayWireMessage;
  } catch {
    return null;
  }
}

export function makeRoomCode(rng: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
