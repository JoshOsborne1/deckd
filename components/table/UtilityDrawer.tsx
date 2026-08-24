/**
 * UtilityDrawer — single utility trigger containing rules, history, undo and
 * end-table. Replaces the duplicated header/rail copies in every game table.
 */

import React, { useCallback } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BookOpen, Clock, Flag, Undo2 } from 'lucide-react-native';
import { EventHistoryModal } from '@components/EventHistoryModal';
import { RulesSheet } from '@components/RulesSheet';
import { useGameStore } from '@store/gameStore';
import { useMotion } from '@hooks/useMotion';
import { selectCanUndo } from '@engine/selectors';
import { colors, fonts, fontSizes, radii, shadow, space } from '@theme';

interface UtilityDrawerProps {
  visible: boolean;
  onClose: () => void;
  /** Optional overrides for viewer identity. */
  viewerId?: string;
}

export function UtilityDrawer({ visible, onClose, viewerId: viewerIdProp }: UtilityDrawerProps) {
  const { haptic } = useMotion();
  const state = useGameStore((s) => s.state);
  const events = useGameStore((s) => s.events);
  const undoLastAction = useGameStore((s) => s.undoLastAction);
  const endSession = useGameStore((s) => s.endSession);
  const [rulesOpen, setRulesOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);

  const viewerId = viewerIdProp ?? state.meta.hostId ?? '';
  const canUndo = selectCanUndo(state, viewerId);

  const handleUndo = useCallback(() => {
    haptic('medium');
    undoLastAction();
    onClose();
  }, [haptic, onClose, undoLastAction]);

  const handleEnd = useCallback(() => {
    haptic('medium');
    endSession(viewerId || undefined);
    onClose();
  }, [endSession, haptic, onClose, viewerId]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close utility drawer">
        <View style={styles.drawer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read table rules"
            onPress={() => setRulesOpen(true)}
            style={styles.item}
          >
            <BookOpen size={20} color={colors.inkMuted} />
            <Text style={styles.itemText}>Rules</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open event log"
            onPress={() => setHistoryOpen(true)}
            style={styles.item}
          >
            <Clock size={20} color={colors.inkMuted} />
            <Text style={styles.itemText}>History</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Undo last action"
            onPress={handleUndo}
            disabled={!canUndo}
            style={[styles.item, !canUndo && styles.itemDisabled]}
          >
            <Undo2 size={20} color={canUndo ? colors.brand : colors.inkSubtle} />
            <Text style={[styles.itemText, !canUndo && styles.itemTextDisabled]}>Undo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="End table"
            onPress={handleEnd}
            style={styles.item}
          >
            <Flag size={20} color={colors.brand} />
            <Text style={[styles.itemText, { color: colors.brand }]}>End table</Text>
          </Pressable>
        </View>
      </Pressable>

      {/* Modals */}
      <RulesSheet visible={rulesOpen} presetId={state.config.presetId} onClose={() => setRulesOpen(false)} />
      <EventHistoryModal visible={historyOpen} events={events} onClose={() => setHistoryOpen(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  drawer: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: space.lg,
    gap: space.md,
    ...shadow.card,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    minHeight: 48,
  },
  itemDisabled: {
    opacity: 0.5,
  },
  itemText: {
    fontSize: fontSizes.body,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  itemTextDisabled: {
    color: colors.inkSubtle,
  },
});
