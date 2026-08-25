import { useMemo } from 'react';
import type { RelaySession } from '@lib/relayTransport';
import { boundViewerId, surfaceBindingFromLegacy } from '@engine/sessionTopology';
import type { GameState, PlayerId } from '@engine/types';
import { useLobbyStore } from '@store/lobbyStore';

export interface TableSessionContext {
  viewerId: PlayerId | null;
  hostPlayerId: PlayerId | null;
  isRemoteGuest: boolean;
  isSharedDevice: boolean;
  isSolo: boolean;
  isNetworked: boolean;
  connectionLabel: string;
  lobbySession: RelaySession | null;
}

/**
 * One ownership rule for table identity and relay routing. Canonical surface /
 * seat fields drive the result; legacy mode is consulted only by the migration
 * adapter when hydrating an old fixture.
 */
export function resolveTableSession(
  state: GameState,
  lobbyStatus: string,
): Omit<TableSessionContext, 'lobbySession'> {
  const hostPlayerId = state.meta.hostId || null;
  const binding = state.meta.seatBinding ?? surfaceBindingFromLegacy(
    state.meta.mode,
    state.meta.hostId,
    state.players.map((player) => player.id),
    state.meta.surfaceProfile,
    state.meta.seatBinding,
  ).seatBinding;
  const viewerId = boundViewerId(binding, state.currentPlayerId);
  const isSharedDevice = binding.kind === 'shared-device';
  const isRemoteGuest = binding.kind === 'single-seat'
    && Boolean(hostPlayerId)
    && binding.playerId !== hostPlayerId;
  const humanPlayers = state.players.filter((player) => player.id !== 'house');
  const isSolo = binding.kind === 'single-seat'
    && humanPlayers.length === 1
    && binding.playerId === humanPlayers[0]?.id;
  const isRelaySurface = !isSolo
    && !isSharedDevice
    && state.meta.surfaceProfile === 'personal-table';
  const connectionLabel = !isRelaySurface
    ? 'Local'
    : lobbyStatus === 'connected'
      ? 'Live'
      : lobbyStatus === 'connecting'
        ? 'Reconnecting'
        : 'Offline';

  return {
    viewerId,
    hostPlayerId,
    isRemoteGuest,
    isSharedDevice,
    isSolo,
    isNetworked: isRelaySurface,
    connectionLabel,
  };
}

export function useTableSession(state: GameState): TableSessionContext {
  const lobbySession = useLobbyStore((store) => store.session);
  const lobbyStatus = useLobbyStore((store) => store.status);
  const resolved = useMemo(
    () => resolveTableSession(state, lobbyStatus),
    [lobbyStatus, state],
  );
  return { ...resolved, lobbySession };
}
