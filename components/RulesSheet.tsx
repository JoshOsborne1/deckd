import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BookOpen, X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardButton } from '@components/CardButton';
import { getRulesGuide } from '@engine/rulesGuide';
import { useMotion } from '@hooks/useMotion';
import { alpha, colors, fonts, letterSpacing, radii, shadow, space } from '@theme';

export interface RulesSheetProps {
  visible: boolean;
  presetId: string | null | undefined;
  onClose: () => void;
}

/** A shared table-native rules sheet used by setup and live play. */
export function RulesSheet({ visible, presetId, onClose }: RulesSheetProps) {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useMotion();
  const guide = getRulesGuide(presetId);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss rules"
          onPress={onClose}
        />
        <View
          accessible
          accessibilityViewIsModal
          accessibilityLabel={`${guide.title} rules`}
          style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}
        >
          <View style={styles.header}>
            <View style={styles.titleGroup}>
              <View style={styles.iconMark}>
                <BookOpen size={17} color={colors.brand} />
              </View>
              <View style={styles.titleCopy}>
                <Text style={styles.eyebrow}>TABLE RULES</Text>
                <Text style={styles.title}>{guide.title}</Text>
              </View>
            </View>
            <CardButton
              variant="ghost"
              size="sm"
              elevated={false}
              haptic="light"
              onPress={onClose}
              accessibilityLabel="Close rules"
            >
              <X size={20} color={colors.inkMuted} />
            </CardButton>
          </View>

          <Text style={styles.summary}>{guide.summary}</Text>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionLabel}>HOW TO PLAY</Text>
            {guide.steps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepCopy}>{step}</Text>
              </View>
            ))}

            <View style={styles.ruleDivider} />
            <Text style={styles.sectionLabel}>WHEN IT ENDS</Text>
            <Text style={styles.endCopy}>{guide.win}</Text>

            <View style={styles.noteBlock}>
              <Text style={styles.noteLabel}>AT THE TABLE</Text>
              <Text style={styles.noteCopy}>{guide.tableNote}</Text>
            </View>
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close rules"
            onPress={onClose}
            style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
          >
            <Text style={styles.closeButtonText}>Back to the table</Text>
          </Pressable>
        </View>
      </View>
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
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1,
    borderColor: alpha.brand20,
    ...shadow.ctaLift,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
    minWidth: 0,
  },
  iconMark: {
    width: 34,
    height: 34,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha.brand10,
    borderWidth: 1,
    borderColor: alpha.brand20,
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  title: {
    marginTop: 2,
    fontSize: 20,
    lineHeight: 24,
    fontFamily: fonts.extra,
    color: colors.ink,
  },
  summary: {
    marginTop: space.md,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
    color: colors.inkMuted,
  },
  scroll: {
    marginTop: space.lg,
    maxHeight: 420,
  },
  scrollContent: {
    paddingBottom: space.sm,
  },
  sectionLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    marginTop: space.md,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  stepNumberText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.surface,
  },
  stepCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  ruleDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: space.lg,
    backgroundColor: alpha.inkOverlay12,
  },
  endCopy: {
    marginTop: space.sm,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.regular,
    color: colors.ink,
  },
  noteBlock: {
    marginTop: space.lg,
    padding: space.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.brand,
    backgroundColor: alpha.inkOverlay06,
  },
  noteLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  noteCopy: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  closeButton: {
    minHeight: 48,
    marginTop: space.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  closeButtonPressed: {
    opacity: 0.86,
  },
  closeButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.surface,
  },
});
