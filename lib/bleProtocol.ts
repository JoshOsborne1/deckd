/**
 * BLE wire format for Deckd — keep payloads small (turn-based; chunk later if needed).
 * Gameplay event replication can build on top of this handshake + envelope.
 */

/** Bump when wire shape changes; incompatible peers refuse or warn. */
export const DECKD_PROTOCOL_VERSION = 1;

/** Practical limit per write/notify before MTU negotiation / chunking (conservative). */
export const MAX_BLE_PAYLOAD_BYTES = 512;

/** Soft cap for session size — BLE throughput + GATT fairness; gameplay can allow more later. */
export const MAX_RECOMMENDED_BLE_PLAYERS = 8;

export type WireRole = 'host' | 'guest';

export type HandshakeMessage = {
  type: 'handshake';
  protocolVersion: number;
  role: WireRole;
  /** App build id for coarse compatibility (e.g. native build number). */
  appBuild: string;
  clientId: string;
};

export type PingMessage = {
  type: 'ping';
  t: number;
};

export type GameStateWireMessage = {
  type: 'game_state';
  data: unknown;
  timestamp: number;
  senderId: string;
};

export type DeckdWireMessage = HandshakeMessage | PingMessage | GameStateWireMessage;

export function parseWireMessage(json: string): DeckdWireMessage | null {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== 'object' || !('type' in v)) return null;
    const t = (v as { type: unknown }).type;
    if (t === 'handshake' || t === 'ping' || t === 'game_state') {
      return v as DeckdWireMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function encodeWireMessage(msg: DeckdWireMessage): string {
  const s = JSON.stringify(msg);
  if (s.length > MAX_BLE_PAYLOAD_BYTES) {
    throw new Error(`BLE payload exceeds ${MAX_BLE_PAYLOAD_BYTES} bytes`);
  }
  return s;
}

export function handshakeCompatible(peerVersion: number): boolean {
  return peerVersion === DECKD_PROTOCOL_VERSION;
}
