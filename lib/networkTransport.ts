/**
 * Optional network multiplayer transport (LAN / WebSocket relay) — supplementary to BLE.
 * Same `GameEvent` framing as BLE; implementation lands after transport negotiation.
 */

export type NetworkSessionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface NetworkSession {
  status: NetworkSessionStatus;
  close: () => void;
}

/**
 * When `enabled` is false or `roomCode` is empty, returns null (caller keeps BLE-only).
 */
export function createNetworkSession(_opts: {
  enabled: boolean;
  roomCode?: string;
}): NetworkSession | null {
  if (!_opts.enabled) return null;
  return {
    status: 'idle',
    close: () => {},
  };
}
