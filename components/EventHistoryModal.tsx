import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { useMotion } from '@hooks/useMotion';
import { formatGameEventLine } from '@lib/eventLogFormat';
import { EASING_ACCELERATE, EASING_EMPHASIZED } from '@lib/motion';
import type { GameEvent } from '@engine/events';
import { alpha, colors, fonts, letterSpacing, motion, space } from '@theme';

const MAX_LINES = 120;

export interface EventHistoryModalProps {
  visible: boolean;
  events: GameEvent[];
  onClose: () => void;
}

/**
 * Read-only scroll of the persisted event log (newest first for scanning).
 * Custom motion: scrim + sheet (spring) instead of the stock Modal slide.
 */
export function EventHistoryModal({ visible, events, onClose }: EventHistoryModalProps) {
  const { reduceMotion } = useMotion();
  const insets = useSafeAreaInsets();
  const [renderModal, setRenderModal] = useState(false);
  const exitUnmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const backdropOpacity = useSharedValue(0);
  const sheetTranslate = useSharedValue(72);

  useEffect(() => {
    if (!visible) return;
    if (exitUnmountTimer.current) {
      clearTimeout(exitUnmountTimer.current);
      exitUnmountTimer.current = null;
    }
    setRenderModal(true);
    backdropOpacity.value = 0;
    sheetTranslate.value = 56;
    rafRef.current = requestAnimationFrame(() => {
      backdropOpacity.value = withTiming(1, {
        duration: reduceMotion ? 160 : 240,
        easing: EASING_EMPHASIZED,
      });
      if (reduceMotion) {
        sheetTranslate.value = withTiming(0, {
          duration: 200,
          easing: EASING_EMPHASIZED,
        });
      } else {
        sheetTranslate.value = withSpring(0, motion.spring.sheet);
      }
    });
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [visible, reduceMotion, backdropOpacity, sheetTranslate]);

  useEffect(() => {
    if (visible || !renderModal) return;
    backdropOpacity.value = withTiming(0, {
      duration: reduceMotion ? 120 : 200,
      easing: EASING_ACCELERATE,
    });
    sheetTranslate.value = withTiming(reduceMotion ? 28 : 56, {
      duration: reduceMotion ? 160 : 220,
      easing: EASING_ACCELERATE,
    });
    const delay = reduceMotion ? 180 : 260;
    exitUnmountTimer.current = setTimeout(() => {
      exitUnmountTimer.current = null;
      setRenderModal(false);
    }, delay);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (exitUnmountTimer.current) {
        clearTimeout(exitUnmountTimer.current);
        exitUnmountTimer.current = null;
      }
    };
  }, [visible, renderModal, reduceMotion, backdropOpacity, sheetTranslate]);

  const displayEvents = React.useMemo(() => {
    return events.slice(-MAX_LINES).reverse();
  }, [events]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslate.value }],
  }));

  if (!renderModal) return null;

  return (
    <Modal visible animationType="none" transparent onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss event log"
          onPress={onClose}
        />
        <Animated.View style={[styles.sheet, { paddingBottom: insets.bottom + space.xl }, sheetStyle]}>
          <View style={styles.header}>
            <Text style={styles.title}>Event log</Text>
            <CardButton variant="ghost" size="sm" elevated={false} haptic="light" onPress={onClose}>
              <X size={20} color={colors.inkMuted} />
            </CardButton>
          </View>
          <Text style={styles.meta}>
            {events.length} events · showing last {Math.min(MAX_LINES, events.length)}
          </Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner}>
            {displayEvents.length === 0 ? (
              <Text style={styles.empty}>No events yet.</Text>
            ) : (
              displayEvents.map((event) => (
                <Text key={event.id} style={styles.line} selectable>
                  {formatGameEventLine(event)}
                </Text>
              ))
            )}
          </ScrollView>
          <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button">
            <Text style={styles.dismissText}>Close</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: alpha.inkOverlay45,
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: letterSpacing.tight,
  },
  meta: {
    marginTop: space.sm,
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  scroll: {
    marginTop: space.md,
    maxHeight: 420,
  },
  scrollInner: {
    paddingBottom: space.lg,
  },
  line: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.inkSoft,
    lineHeight: 16,
    marginBottom: 6,
  },
  empty: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  dismiss: {
    marginTop: space.md,
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  dismissText: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.brand,
  },
});
