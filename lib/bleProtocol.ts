/**
 * BLE wire format for Deckd — event replication with chunking, ACK, and sequence numbers.
 */

/** Bump when wire shape changes; incompatible peers refuse or warn. */
export const DECKD_PROTOCOL_VERSION = 1;

/** Conservative BLE payload limit before chunking. */
export const MAX_BLE_PAYLOAD_BYTES = 512;

/** Soft cap for session size. */
export const MAX_RECOMMENDED_BLE_PLAYERS = 8;

export type WireRole = 'host' | 'guest';

export interface BaseWireMessage {
  readonly v: typeof DECKD_PROTOCOL_VERSION;
  /** Monotonic sequence number for ordering and deduplication */
  readonly seq: number;
  /** Unique message id for ACK correlation */
  readonly mid: string;
  /** Unix timestamp ms */
  readonly ts: number;
}

export type HandshakeMessage = BaseWireMessage & {
  type: 'handshake';
  role: WireRole;
  /** App build id for coarse compatibility */
  appBuild: string;
  clientId: string;
  /** Session id the peer wants to join, or empty for new */
  sessionId?: string;
};

export type PingMessage = BaseWireMessage & {
  type: 'ping';
};

export type PongMessage = BaseWireMessage & {
  type: 'pong';
  /** Echo back the ping's mid */
  pingMid: string;
};

export type EventBatchMessage = BaseWireMessage & {
  type: 'event_batch';
  /** Session id these events belong to */
  sessionId: string;
  /** Serialized GameEvent[] */
  events: string;
  /** Whether host requires ACK for this batch */
  ackPolicy: 'none' | 'lazy' | 'eager';
  /** If this is a chunked message, the chunk index */
  chunkIndex?: number;
  /** Total chunks for this logical message */
  totalChunks?: number;
};

export type AckMessage = BaseWireMessage & {
  type: 'ack';
  /** The mid being acknowledged */
  ackMid: string;
};

export type SnapshotMessage = BaseWireMessage & {
  type: 'snapshot';
  sessionId: string;
  /** Compact game state snapshot (not full event log) */
  snapshot: string;
  /** Next expected event sequence after this snapshot */
  nextSeq: number;
};

export type GuestIntentMessage = BaseWireMessage & {
  type: 'guest_intent';
  intent: 'join' | 'ready' | 'request_action';
  /** JSON payload for the intent */
  payload: string;
};

export type DeckdWireMessage =
  | HandshakeMessage
  | PingMessage
  | PongMessage
  | EventBatchMessage
  | AckMessage
  | SnapshotMessage
  | GuestIntentMessage;

export type MessageType = DeckdWireMessage['type'];

let _seq = 0;
function nextSeq(): number {
  _seq = (_seq + 1) % 0xffffffff;
  return _seq;
}

export function makeMid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function baseHeader(mid = makeMid()): Pick<BaseWireMessage, 'v' | 'seq' | 'mid' | 'ts'> {
  return { v: DECKD_PROTOCOL_VERSION, seq: nextSeq(), mid, ts: Date.now() };
}

export function buildHandshake(opts: Omit<HandshakeMessage, 'type' | 'v' | 'seq' | 'mid' | 'ts'>): HandshakeMessage {
  return { type: 'handshake', ...baseHeader(), ...opts };
}

export function buildPing(): PingMessage {
  return { type: 'ping', ...baseHeader() };
}

export function buildPong(pingMid: string): PongMessage {
  return { type: 'pong', ...baseHeader(), pingMid };
}

export function buildEventBatch(
  opts: Omit<EventBatchMessage, 'type' | 'v' | 'seq' | 'mid' | 'ts'>,
  mid?: string,
): EventBatchMessage {
  return { type: 'event_batch', ...baseHeader(mid), ...opts };
}

export function buildAck(ackMid: string): AckMessage {
  return { type: 'ack', ...baseHeader(), ackMid };
}

export function buildSnapshot(opts: Omit<SnapshotMessage, 'type' | 'v' | 'seq' | 'mid' | 'ts'>): SnapshotMessage {
  return { type: 'snapshot', ...baseHeader(), ...opts };
}

export function buildGuestIntent(
  opts: Omit<GuestIntentMessage, 'type' | 'v' | 'seq' | 'mid' | 'ts'>,
): GuestIntentMessage {
  return { type: 'guest_intent', ...baseHeader(), ...opts };
}

export function parseWireMessage(json: string): DeckdWireMessage | null {
  try {
    const v = JSON.parse(json) as unknown;
    if (!v || typeof v !== 'object' || !('type' in v)) return null;
    const t = (v as { type: unknown }).type;
    if (
      t === 'handshake' ||
      t === 'ping' ||
      t === 'pong' ||
      t === 'event_batch' ||
      t === 'ack' ||
      t === 'snapshot' ||
      t === 'guest_intent'
    ) {
      return v as DeckdWireMessage;
    }
    return null;
  } catch {
    return null;
  }
}

/** Encode a message; throws if single-chunk payload exceeds MAX_BLE_PAYLOAD_BYTES */
export function encodeWireMessage(msg: DeckdWireMessage): string {
  const s = JSON.stringify(msg);
  if (s.length > MAX_BLE_PAYLOAD_BYTES && (msg.type !== 'event_batch' || msg.chunkIndex == null)) {
    throw new Error(`BLE payload exceeds ${MAX_BLE_PAYLOAD_BYTES} bytes and is not chunked`);
  }
  return s;
}

/** Chunk a large event batch into multiple wire messages */
export function chunkEventBatch(
  sessionId: string,
  eventsJson: string,
  ackPolicy: EventBatchMessage['ackPolicy'],
  chunkSize = MAX_BLE_PAYLOAD_BYTES - 64,
): EventBatchMessage[] {
  if (eventsJson.length <= MAX_BLE_PAYLOAD_BYTES - 64) {
    return [buildEventBatch({ sessionId, events: eventsJson, ackPolicy })];
  }

  const chunks: string[] = [];
  for (let i = 0; i < eventsJson.length; i += chunkSize) {
    chunks.push(eventsJson.slice(i, i + chunkSize));
  }

  const batchMid = makeMid();
  return chunks.map((events, idx) =>
    buildEventBatch(
      {
        sessionId,
        events,
        ackPolicy: idx === chunks.length - 1 ? ackPolicy : 'none',
        chunkIndex: idx,
        totalChunks: chunks.length,
      },
      batchMid,
    ),
  );
}

export function handshakeCompatible(peerVersion: number): boolean {
  return peerVersion === DECKD_PROTOCOL_VERSION;
}
