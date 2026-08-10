import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlipHorizontal2, Pencil, Trash2 } from 'lucide-react-native';
import { PlayingCard } from '@components/PlayingCard';
import { TableSurface } from '@components/TableSurface';
import { NAV_BAR_RESERVE } from '@components/GlobalNavBar';
import { builtinPresets } from '@engine/index';
import { useMotion } from '@hooks/useMotion';
import { PRESET_BACKS } from '@lib/presetAssets';
import { useUserPresetsStore } from '@store/presetsStore';
import { alpha, colors, fontSizes, fonts, letterSpacing, motion as motionTokens, radii, shadow, space, textStyles } from '@theme';

function playerRangeLabel(supportsPlayerCount: (n: number) => boolean): string {
  const supported = Array.from({ length: 9 }, (_, idx) => idx + 2).filter((count) =>
    supportsPlayerCount(count),
  );
  if (supported.length === 0) return '2-10 players';
  return `${supported[0]}-${supported[supported.length - 1]} players`;
}

export default function ListScreen() {
  const insets = useSafeAreaInsets();

  const defaultPresetId = useUserPresetsStore((s) => s.defaultPresetId);
  const presets = useUserPresetsStore((s) => s.presets);
  const setDefault = useUserPresetsStore((s) => s.setDefault);
  const createFromBuiltin = useUserPresetsStore((s) => s.createFromBuiltin);
  const updatePreset = useUserPresetsStore((s) => s.updatePreset);
  const deletePreset = useUserPresetsStore((s) => s.deletePreset);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftSummary, setDraftSummary] = useState('');
  const [cloneOpen, setCloneOpen] = useState(false);

  const beginEdit = (id: string, name: string, summary: string) => {
    setEditingId(id);
    setDraftName(name);
    setDraftSummary(summary);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updatePreset(editingId, { name: draftName, summary: draftSummary });
    setEditingId(null);
  };

  const ownedCount = presets.length;
  const libraryCount = builtinPresets.length + ownedCount;

  return (
    <View style={styles.container}>
      <TableSurface mode="setup" />
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + NAV_BAR_RESERVE + space.x5l },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>THE LIBRARY · {libraryCount} RECIPES</Text>
        <Text style={styles.title}>Rulesets</Text>
        <Text style={styles.subtitle}>
          The deck is one object; the recipe is how you play it. Built-ins below, yours after.
        </Text>

        {/* Built-in recipe cards, fanned on the felt. */}
        <View style={styles.railWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rail}
            style={styles.railScroll}
          >
            {builtinPresets.map((preset, index) => {
              const active = defaultPresetId === preset.id;
              return (
                <RecipeCard
                  key={preset.id}
                  preset={preset}
                  index={index}
                  active={active}
                  onPress={() => setDefault(preset.id)}
                />
              );
            })}
          </ScrollView>
        </View>

        {/* Your presets: stacked cards, actions as deck objects. */}
        <View style={styles.ownedSection}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Yours</Text>
            <Text style={styles.sectionIndex}>0{ownedCount}</Text>
          </View>

          {presets.length === 0 ? (
            <View style={styles.emptyRow}>
              <Text style={styles.emptyText}>
                No custom recipes yet. Duplicate a built-in and make it yours.
              </Text>
            </View>
          ) : (
            <View style={styles.ownedStack}>
              {presets.map((preset) => {
                const active = defaultPresetId === preset.id;
                const editing = editingId === preset.id;
                const back = PRESET_BACKS[preset.basedOn] ?? 'back-brand';
                return (
                  <View key={preset.id} style={styles.ownedCardWrap}>
                    <View
                      style={[
                        styles.ownedCard,
                        active && styles.ownedCardActive,
                      ]}
                    >
                      <View style={styles.ownedMain}>
                        <PlayingCard size="sm" face="down" back={back} overlapped />
                        <View style={styles.ownedCopy}>
                          <Text style={styles.ownedEyebrow}>BASED ON · {preset.basedOn.replace(/-/g, ' ').toUpperCase()}</Text>
                          <Text numberOfLines={1} style={styles.ownedTitle}>{preset.name}</Text>
                          <Text numberOfLines={2} style={styles.ownedSummary}>{preset.summary}</Text>
                        </View>
                        <View style={styles.ownedStamp}>
                          {active ? (
                            <Text style={styles.stampText}>DEFAULT</Text>
                          ) : (
                            <View style={styles.stampEmpty} />
                          )}
                        </View>
                      </View>
                      <View style={styles.ownedActions}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={active ? `${preset.name} is the default recipe` : `Set ${preset.name} as default`}
                          accessibilityState={{ selected: active }}
                          onPress={() => setDefault(preset.id)}
                          style={({ pressed }) => [
                            styles.chip,
                            active && styles.chipActive,
                            pressed && styles.chipPressed,
                          ]}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {active ? 'Default' : 'Set default'}
                          </Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Edit ${preset.name}`}
                          onPress={() => beginEdit(preset.id, preset.name, preset.summary)}
                          style={({ pressed }) => [styles.iconChip, pressed && styles.chipPressed]}
                        >
                          <Pencil size={15} color={colors.inkMuted} strokeWidth={1.8} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete ${preset.name}`}
                          onPress={() => deletePreset(preset.id)}
                          style={({ pressed }) => [styles.iconChip, pressed && styles.chipPressed]}
                        >
                          <Trash2 size={15} color={colors.brand} strokeWidth={1.8} />
                        </Pressable>
                      </View>
                    </View>

                    {editing ? (
                      <View style={styles.editor}>
                        <Text style={styles.fieldLabel}>Name</Text>
                        <TextInput
                          value={draftName}
                          onChangeText={setDraftName}
                          style={styles.editorInput}
                          placeholder="Recipe name"
                          placeholderTextColor={colors.inkSubtle}
                          maxLength={32}
                        />
                        <Text style={styles.fieldLabel}>One-liner</Text>
                        <TextInput
                          value={draftSummary}
                          onChangeText={setDraftSummary}
                          style={[styles.editorInput, styles.editorInputTall]}
                          placeholder="What makes this recipe worth keeping"
                          placeholderTextColor={colors.inkSubtle}
                          multiline
                          maxLength={140}
                        />
                        <View style={styles.editorActions}>
                          <Pressable
                            accessibilityRole="button"
                            onPress={saveEdit}
                            style={({ pressed }) => [styles.saveButton, pressed && styles.saveButtonPressed]}
                          >
                            <Text style={styles.saveButtonText}>Save</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setEditingId(null)}
                            style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                          >
                            <Text style={styles.chipText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.addRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a recipe"
              onPress={() => setCloneOpen((prev) => !prev)}
              style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
            >
              <FlipHorizontal2 size={16} color={colors.surface} strokeWidth={2} />
              <Text style={styles.addButtonText}>Add a recipe</Text>
            </Pressable>
          </View>

          {cloneOpen ? (
            <View style={styles.cloneList}>
              {builtinPresets.map((builtin) => (
                <Pressable
                  key={`clone-${builtin.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Duplicate ${builtin.name}`}
                  onPress={() => {
                    createFromBuiltin(builtin.id);
                    setCloneOpen(false);
                  }}
                  style={({ pressed }) => [styles.cloneRow, pressed && styles.chipPressed]}
                >
                  <PlayingCard size="xs" face="down" back={PRESET_BACKS[builtin.id] ?? 'back-brand'} overlapped />
                  <Text style={styles.cloneText}>Duplicate {builtin.name}</Text>
                  <Text style={styles.cloneRange}>{playerRangeLabel(builtin.supportsPlayerCount)}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function RecipeCard({
  preset,
  index,
  active,
  onPress,
}: {
  preset: (typeof builtinPresets)[number];
  index: number;
  active: boolean;
  onPress: () => void;
}) {
  const flip = useSharedValue(active ? 1 : 0);
  const { reduceMotion } = useMotion();

  useEffect(() => {
    flip.value = withTiming(active ? 1 : 0, {
      duration: reduceMotion ? 0 : motionTokens.duration.slow,
    });
  }, [active, flip, reduceMotion]);

  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(flip.value, [0, 1], [180, 0])}deg` },
    ],
  }));
  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${interpolate(flip.value, [0, 1], [0, -180])}deg` },
    ],
  }));

  const rotation = active ? '0deg' : `${[-4, -1, 1, 4][index] ?? 0}deg`;
  const range = playerRangeLabel(preset.supportsPlayerCount);

  return (
    <View style={[styles.recipeStagger, { zIndex: active ? 20 : index }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${preset.name}. ${preset.summary}. ${range}`}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.recipeCardSlot,
          { transform: [{ rotate: rotation }, ...(pressed ? [{ scale: 0.98 }] : [])] },
        ]}
      >
        <Animated.View style={[styles.recipeCardFace, styles.recipeCardBack, backStyle]}>
          <PlayingCard face="down" back={PRESET_BACKS[preset.id] ?? 'back-brand'} size="md" overlapped />
        </Animated.View>
        <Animated.View style={[styles.recipeCardFace, styles.recipeCardFront, frontStyle]}>
          <View style={styles.recipeFrontInner}>
            <Text style={styles.recipeEyebrow}>RECIPE</Text>
            <Text numberOfLines={2} style={styles.recipeTitle}>{preset.name}</Text>
            <Text numberOfLines={2} style={styles.recipeSummary}>{preset.summary}</Text>
            <View style={styles.recipeFooter}>
              <Text style={styles.recipeRange}>{range}</Text>
              <Text style={styles.recipeFlipMark}>{active ? 'DEFAULT' : 'TAP'}</Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
      <Text numberOfLines={1} style={[styles.recipeName, active && styles.recipeNameActive]}>
        {preset.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingHorizontal: space.xl },
  kicker: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.xs,
  },
  title: {
    ...textStyles.h1,
    marginBottom: space.xs,
  },
  subtitle: {
    ...textStyles.bodyMuted,
    fontSize: fontSizes.small,
    maxWidth: 300,
    marginBottom: space.lg,
  },
  railWrap: { marginHorizontal: -space.xl },
  railScroll: { overflow: 'visible' },
  rail: {
    paddingHorizontal: space.xl,
    paddingTop: space.xs,
    paddingBottom: space.xs,
  },
  recipeStagger: {
    width: 90,
    marginRight: -10,
    alignItems: 'center',
  },
  recipeCardSlot: {
    width: 90,
    height: 126,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCardFace: {
    position: 'absolute',
    width: 90,
    height: 126,
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
  },
  recipeCardBack: { zIndex: 1 },
  recipeCardFront: {
    zIndex: 2,
    overflow: 'hidden',
    borderRadius: radii.card,
    backgroundColor: colors.cardPaper,
    borderWidth: 1,
    borderColor: colors.cardEdge,
    ...shadow.cardStrong,
  },
  recipeFrontInner: {
    flex: 1,
    width: '100%',
    padding: space.sm,
    justifyContent: 'space-between',
  },
  recipeEyebrow: {
    fontSize: 8,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
  },
  recipeTitle: {
    marginTop: space.xs,
    fontSize: 14,
    lineHeight: 16,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: letterSpacing.tight,
  },
  recipeSummary: {
    marginTop: space.xs,
    fontSize: 10,
    lineHeight: 13,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  recipeFooter: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  recipeRange: {
    flex: 1,
    fontSize: 9,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
  },
  recipeFlipMark: {
    fontSize: 8,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  recipeName: {
    maxWidth: 90,
    marginTop: space.xs,
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
    textAlign: 'center',
  },
  recipeNameActive: {
    color: colors.ink,
    fontFamily: fonts.bold,
  },
  ownedSection: { marginTop: space.xl },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  sectionTitle: {
    ...textStyles.h3,
  },
  sectionIndex: {
    fontSize: 11,
    fontFamily: fonts.extra,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
  emptyRow: {
    borderTopWidth: 1,
    borderTopColor: alpha.navLine,
    paddingVertical: space.lg,
  },
  emptyText: {
    ...textStyles.bodyMuted,
    fontSize: fontSizes.small,
  },
  ownedStack: { gap: space.md },
  ownedCardWrap: { gap: space.sm },
  ownedCard: {
    borderWidth: 1,
    borderColor: alpha.inkOverlay08,
    borderRadius: radii.lg,
    backgroundColor: alpha.whiteOverlay20,
    padding: space.md,
    gap: space.sm,
  },
  ownedCardActive: {
    borderColor: alpha.brand30,
    backgroundColor: alpha.brand10,
  },
  ownedMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  ownedCopy: { flex: 1, minWidth: 0 },
  ownedEyebrow: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
    marginBottom: 2,
  },
  ownedTitle: {
    fontSize: 16,
    lineHeight: 18,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: letterSpacing.tight,
  },
  ownedSummary: {
    marginTop: 3,
    fontSize: fontSizes.small,
    lineHeight: 16,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  ownedStamp: {
    alignSelf: 'flex-start',
    width: 52,
    alignItems: 'flex-end',
  },
  stampText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
    borderWidth: 1,
    borderColor: alpha.brand30,
    borderRadius: radii.xs,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  stampEmpty: { width: 1, height: 1 },
  ownedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: alpha.inkOverlay12,
    backgroundColor: alpha.whiteOverlay45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brand,
  },
  chipPressed: { opacity: 0.7 },
  chipText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.ink,
    letterSpacing: letterSpacing.cap,
  },
  chipTextActive: {
    color: colors.surface,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: alpha.inkOverlay12,
    backgroundColor: alpha.whiteOverlay45,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editor: {
    borderWidth: 1,
    borderColor: alpha.inkOverlay08,
    borderRadius: radii.lg,
    backgroundColor: alpha.whiteOverlay45,
    padding: space.md,
    gap: space.sm,
  },
  fieldLabel: {
    ...textStyles.label,
  },
  editorInput: {
    borderWidth: 1,
    borderColor: alpha.inkOverlay12,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: fontSizes.body,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  editorInputTall: {
    minHeight: space.x5l * 2,
    textAlignVertical: 'top',
  },
  editorActions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  saveButton: {
    minHeight: 44,
    paddingHorizontal: space.lg,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  saveButtonPressed: { opacity: 0.85 },
  saveButtonText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.bold,
    color: colors.surface,
    letterSpacing: letterSpacing.cap,
  },
  addRow: {
    marginTop: space.lg,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  addButton: {
    minHeight: 44,
    paddingHorizontal: space.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    ...shadow.card,
  },
  addButtonPressed: { opacity: 0.85 },
  addButtonText: {
    fontSize: fontSizes.small,
    fontFamily: fonts.bold,
    color: colors.surface,
    letterSpacing: letterSpacing.cap,
  },
  cloneList: {
    marginTop: space.md,
    gap: space.sm,
  },
  cloneRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: alpha.navLine,
    paddingVertical: space.sm,
  },
  cloneText: {
    flex: 1,
    fontSize: fontSizes.small,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  cloneRange: {
    fontSize: 10,
    fontFamily: fonts.semibold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.cap,
  },
});
