/**
 * TableShell — one shell owning safe areas, table material, connection/turn
 * edge state, and a single utility trigger (blueprint §9).
 *
 * Every game composition renders inside this shell. The shell replaces the
 * duplicated header/rail copies previously spread across game tables.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, Menu, X } from 'lucide-react-native';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';
import { useLobbyStore } from '@store/lobbyStore';
import { useMotion } from '@hooks/useMotion';
import { selectCurrentPlayerId, selectIsMyTurn } from '@engine/selectors';
import { colors, fonts, fontSizes, letterSpacing, space } from '@theme';
import { UtilityDrawer } from './UtilityDrawer';

interface TableShellProps {
  children: React.ReactNode;
  /** Game title shown in the header. */
  title: string;
  /** Turn eyebrow text override. */
  turnLabel?: string;
  /** Whether the session is active (not idle). */
  active: boolean;
  topInset: number;
  bottomInset: number;
  /** Optional header accessory (e.g. sync dot). */
  headerAccessory?: React.ReactNode;
  /** Called when the back-to-hub affordance is pressed. */
  onBackToHub?: () => void;
}

/**
 * One shell for every game surface. Owns:
 * - safe areas and table material
 * - connection/turn edge state
 * - single utility trigger (rules / history / undo / end-table)
 */
export function TableShell({
  children,
  title,
  turnLabel,
  active,
  topInset,
  bottomInset,
  headerAccessory,
  onBackToHub,
}: TableShellProps) {
  const { haptic } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const state = useGameStore((s) => s.state);
  const lobbyStatus = useLobbyStore((s) => s.status);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const currentPlayerId = useMemo(() => selectCurrentPlayerId(state), [state]);
  const currentPlayerName = useMemo(
    () => state.players.find((player) => player.id === currentPlayerId)?.name ?? '',
    [currentPlayerId, state.players],
  );

  const viewerId = state.meta.hostId || null;
  const isMyTurn = viewerId ? selectIsMyTurn(state, viewerId) : false;

  const handleBack = useCallback(() => {
    haptic('light');
    if (onBackToHub) {
      onBackToHub();
    } else {
      setViewMode('hub');
    }
  }, [haptic, onBackToHub, setViewMode]);

  const toggleDrawer = useCallback(() => {
    haptic('light');
    setDrawerOpen((open) => !open);
  }, [haptic]);

  const eyebrow = turnLabel ?? (isMyTurn ? 'YOUR TURN' : `${currentPlayerName.toUpperCase()} · TO PLAY`);

  return (
    <View style={[styles.root, { paddingTop: topInset, paddingBottom: bottomInset }]} pointerEvents={active ? 'auto' : 'none'}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to hub"
          onPress={handleBack}
          style={styles.headerButton}
        >
          <ChevronLeft size={18} color={colors.inkMuted} />
          <Text style={styles.headerButtonText}>Hub</Text>
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          {title ? <Text style={styles.title}>{title}</Text> : null}
        </View>
        <View style={styles.headerRight}>
          {lobbyStatus === 'connected' && <View style={styles.syncDot} />}
          {headerAccessory}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open utility drawer"
            onPress={toggleDrawer}
            style={styles.headerButton}
          >
            {drawerOpen ? <X size={18} color={colors.inkMuted} /> : <Menu size={18} color={colors.inkMuted} />}
          </Pressable>
        </View>
      </View>

      {/* Game composition */}
      <View style={styles.content}>
        {children}
      </View>

      {/* Utility drawer */}
      <UtilityDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    gap: space.sm,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    minWidth: 44,
    minHeight: 44,
  },
  headerButtonText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  eyebrow: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
    textAlign: 'center',
  },
  title: {
    fontSize: fontSizes.body,
    fontFamily: fonts.semibold,
    color: colors.ink,
    textAlign: 'center',
  },
  syncDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand,
    marginRight: space.xs,
  },
  content: {
    flex: 1,
  },
});
