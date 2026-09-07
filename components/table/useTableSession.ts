import { useMemo } from 'react';
import type { RelaySession } from '@lib/relayTransport';
import { boundViewerId, surfaceBindingFromLegacy } from '@engine/sessionTopology';
import type { GameState, PlayerId } from '@engine/types';
import { useGameStore } from '@store/gameStore';
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
 * Pure table-identity derivation. One ownership rule for seat binding and
 * relay routing; legacy mode is consulted only by the migration adapter when
 * hydrating an old fixture. Shared by `resolveTableSession` (tests / pure
 * paths) and the selector-based `useTableSession` hook.
 */
function deriveTableSession(
  meta: GameState['meta'],
  playerIds: string[],
  currentPlayerId: PlayerId,
  lobbyStatus: string,
): Omit<TableSessionContext, 'lobbySession'> {
  const hostPlayerId = meta.hostId || null;
  const binding = meta.seatBinding ?? surfaceBindingFromLegacy(
    meta.mode,
    meta.hostId,
    playerIds,
    meta.surfaceProfile,
    meta.seatBinding,
  ).seatBinding;
  const viewerId = boundViewerId(binding, currentPlayerId);
  const isSharedDevice = binding.kind === 'shared-device';
  const isRemoteGuest = binding.kind === 'single-seat'
    && Boolean(hostPlayerId)
    && binding.playerId !== hostPlayerId;
  const humanPlayers = playerIds.filter((id) => id !== 'house');
  const isSolo = binding.kind === 'single-seat'
    && humanPlayers.length === 1
    && binding.playerId === humanPlayers[0];
  const isRelaySurface = !isSolo
    && !isSharedDevice
    && meta.surfaceProfile === 'personal-table';
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

export function resolveTableSession(
  state: GameState,
  lobbyStatus: string,
): Omit<TableSessionContext, 'lobbySession'> {
  return deriveTableSession(
    state.meta,
    state.players.map((player) => player.id),
    state.currentPlayerId,
    lobbyStatus,
  );
}

/**
 * Table identity with narrow store selectors: `meta` is replaced only on
 * `session/start` and the player id list is collapsed to a primitive key, so
 * chrome (TableShell, UtilityDrawer) stops re-rendering on every engine event.
 */
export function useTableSession(): TableSessionContext {
  const lobbySession = useLobbyStore((store) => store.session);
  const lobbyStatus = useLobbyStore((store) => store.status);
  const meta = useGameStore((s) => s.state.meta);
  const currentPlayerId = useGameStore((s) => s.state.currentPlayerId);
  const playerIdKey = useGameStore((s) => s.state.players.map((player) => player.id).join(','));
  const resolved = useMemo(
    () => deriveTableSession(
      meta,
      playerIdKey ? playerIdKey.split(',') : [],
      currentPlayerId,
      lobbyStatus,
    ),
    [lobbyStatus, meta, playerIdKey, currentPlayerId],
  );
  return { ...resolved, lobbySession };
}
