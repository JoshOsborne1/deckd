/**
 * Session topology (blueprint §7.1).
 *
 * Four separated concerns that replace the legacy `SessionMeta.mode` soup.
 * Canonical game state stops depending on `mode`; these fields ride alongside
 * it during migration via a compat adapter.
 */

export type Authority =
  | { kind: 'local' }
  | { kind: 'nearby-host'; peerId: string }
  | { kind: 'cloud-server'; roomId: string };

export type TransportKind = 'in-process' | 'relay' | 'nearby';

export type SurfaceProfile =
  | 'hot-seat'
  | 'personal-table'
  | 'dual-end-board'
  | 'public-table'
  | 'private-hand';

export type SeatBinding =
  | { kind: 'single-seat'; playerId: string }
  | { kind: 'shared-device'; playerIds: string[] }
  | { kind: 'table-only' };

/** Extended session metadata: legacy mode plus the new topology fields. */
export interface SessionTopology {
  authority: Authority;
  transport: TransportKind;
  surfaceProfile: SurfaceProfile;
  seatBinding: SeatBinding;
}

/** Legacy mode string for compat during migration. */
export type LegacyMode = 'pass' | 'solo' | 'ble-host' | 'ble-guest' | 'online-host' | 'online-guest';

/**
 * Compat adapter: derive the four separated concerns from a legacy mode.
 * This is the ONLY place mode soup is translated; new code consumes
 * `SessionTopology` directly and never inspects `SessionMeta.mode`.
 */
export function topologyFromLegacyMode(
  mode: LegacyMode,
  hostId: string,
  playerIds: string[],
): SessionTopology {
  switch (mode) {
    case 'solo':
      return {
        authority: { kind: 'local' },
        transport: 'in-process',
        surfaceProfile: 'personal-table',
        seatBinding: { kind: 'single-seat', playerId: hostId },
      };
    case 'pass':
      return {
        authority: { kind: 'local' },
        transport: 'in-process',
        surfaceProfile: 'hot-seat',
        seatBinding: { kind: 'shared-device', playerIds },
      };
    case 'ble-host':
      return {
        authority: { kind: 'nearby-host', peerId: '' },
        transport: 'nearby',
        surfaceProfile: 'personal-table',
        seatBinding: { kind: 'single-seat', playerId: hostId },
      };
    case 'ble-guest':
      return {
        authority: { kind: 'nearby-host', peerId: '' },
        transport: 'nearby',
        surfaceProfile: 'personal-table',
        seatBinding: { kind: 'single-seat', playerId: playerIds[0] ?? '' },
      };
    case 'online-host':
      return {
        authority: { kind: 'cloud-server', roomId: '' },
        transport: 'relay',
        surfaceProfile: 'personal-table',
        seatBinding: { kind: 'single-seat', playerId: hostId },
      };
    case 'online-guest':
      return {
        authority: { kind: 'cloud-server', roomId: '' },
        transport: 'relay',
        surfaceProfile: 'personal-table',
        seatBinding: { kind: 'single-seat', playerId: playerIds[0] ?? '' },
      };
    default:
      return {
        authority: { kind: 'local' },
        transport: 'in-process',
        surfaceProfile: 'hot-seat',
        seatBinding: { kind: 'shared-device', playerIds },
      };
  }
}

/** Whether this topology represents an authoritative local session. */
export function isLocalAuthority(authority: Authority): boolean {
  return authority.kind === 'local';
}

/** Whether this topology requires network transport. */
export function isNetworkTransport(transport: TransportKind): boolean {
  return transport === 'relay' || transport === 'nearby';
}

/** Whether the surface profile conceals other players' hands. */
export function isPrivateHandProfile(profile: SurfaceProfile): boolean {
  return profile === 'private-hand' || profile === 'hot-seat' || profile === 'personal-table';
}
