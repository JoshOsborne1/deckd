/**
 * UtilityDrawer — single utility trigger containing rules, history, undo and
 * end-table. Replaces the duplicated header/rail copies in every game table.
 */

import React, { useCallback } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BookOpen, Clock, Flag, Undo2 } from 'lucide-react-native';
import { EventHistoryModal } from '@components/EventHistoryModal';
import { RulesSheet } from '@components/RulesSheet';
import { useGameStore } from '@store/gameStore';
import { useMotion } from '@hooks/useMotion';
import { selectCanUndo } from '@engine/selectors';
import { alpha, colors, fonts, fontSizes, letterSpacing, radii, shadow, space } from '@theme';
import { useTableSession } from './useTableSession';

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
  const [endConfirmOpen, setEndConfirmOpen] = React.useState(false);

  const tableSession = useTableSession(state);
  const viewerId = viewerIdProp ?? tableSession.viewerId ?? '';
  const canUndo = selectCanUndo(state, viewerId);
  const undoEnabled = canUndo && !tableSession.isRemoteGuest;

  const handleUndo = useCallback(() => {
    haptic('medium');
    undoLastAction();
    onClose();
  }, [haptic, onClose, undoLastAction]);

  const finishEnd = useCallback(() => {
    endSession(viewerId || undefined);
    onClose();
    setEndConfirmOpen(false);
  }, [endSession, onClose, viewerId]);

  const handleEnd = useCallback(() => {
    haptic('medium');
    if (Platform.OS === 'web') {
      onClose();
      setEndConfirmOpen(true);
      return;
    }
    Alert.alert('End table?', 'This closes the table for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End table',
        style: 'destructive',
        onPress: finishEnd,
      },
    ]);
  }, [finishEnd, haptic, onClose]);

  return (
    <>
      {visible ? (
        <View style={styles.overlay}>
          <View style={styles.backdrop}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close utility drawer"
            />
            <View style={styles.drawer}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Read table rules"
                onPress={() => {
                  setRulesOpen(true);
                  onClose();
                }}
                style={styles.item}
              >
                <BookOpen size={20} color={colors.inkMuted} />
                <Text style={styles.itemText}>Rules</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open event log"
                onPress={() => {
                  setHistoryOpen(true);
                  onClose();
                }}
                style={styles.item}
              >
                <Clock size={20} color={colors.inkMuted} />
                <Text style={styles.itemText}>History</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Undo last action"
                onPress={handleUndo}
                disabled={!undoEnabled}
                style={[styles.item, !undoEnabled && styles.itemDisabled]}
              >
                <Undo2 size={20} color={undoEnabled ? colors.brand : colors.inkSubtle} />
                <Text style={[styles.itemText, !undoEnabled && styles.itemTextDisabled]}>Undo</Text>
              </Pressable>
              {!tableSession.isRemoteGuest ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="End table"
                  onPress={handleEnd}
                  style={styles.item}
                >
                  <Flag size={20} color={colors.brand} />
                  <Text style={[styles.itemText, styles.dangerText]}>End table</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      <Modal
        visible={endConfirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEndConfirmOpen(false)}
      >
        <View style={styles.confirmBackdrop}>
          <View
            accessible
            accessibilityViewIsModal
            accessibilityLabel="End table confirmation"
            style={styles.confirmCard}
          >
            <Text style={styles.confirmEyebrow}>END TABLE?</Text>
            <Text style={styles.confirmTitle}>Close this table?</Text>
            <Text style={styles.confirmCopy}>This ends the current deal and clears the table.</Text>
            <View style={styles.confirmActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel end table"
                onPress={() => setEndConfirmOpen(false)}
                style={styles.confirmCancel}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Confirm end table"
                onPress={finishEnd}
                style={styles.confirmEnd}
              >
                <Text style={styles.confirmEndText}>End table</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <RulesSheet visible={rulesOpen} presetId={state.config.presetId} onClose={() => setRulesOpen(false)} />
      <EventHistoryModal visible={historyOpen} events={events} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  backdrop: {
    flex: 1,
    backgroundColor: alpha.inkOverlay45,
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
  dangerText: {
    color: colors.brand,
  },
  confirmBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
    backgroundColor: alpha.inkOverlay45,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    padding: space.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    ...shadow.ctaLift,
  },
  confirmEyebrow: {
    fontSize: fontSizes.caption,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  confirmTitle: {
    marginTop: space.xs,
    fontSize: fontSizes.h3,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  confirmCopy: {
    marginTop: space.sm,
    fontSize: fontSizes.body,
    lineHeight: 21,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xl,
  },
  confirmCancel: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  confirmCancelText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  confirmEnd: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    backgroundColor: colors.brand,
  },
  confirmEndText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.bold,
    color: colors.surface,
  },
});
