import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { PlayingCard } from '@components/PlayingCard';
import { builtinPresets } from '@engine/index';
import { useMotion } from '@hooks/useMotion';
import { useUserPresetsStore } from '@store/presetsStore';
import { useProfileStore } from '@store/profileStore';
import { alpha, colors, fontSizes, fonts, letterSpacing, radii, shadow, space, textStyles } from '@theme';

function playerRangeLabel(supportsPlayerCount: (n: number) => boolean): string {
  const supported = Array.from({ length: 9 }, (_, idx) => idx + 2).filter((count) =>
    supportsPlayerCount(count),
  );
  if (supported.length === 0) return '2-10 PLAYERS';
  return `${supported[0]}-${supported[supported.length - 1]} PLAYERS`;
}

export default function ListScreen() {
  const insets = useSafeAreaInsets();
  const { reduceMotion } = useMotion();
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const defaultPresetId = useUserPresetsStore((s) => s.defaultPresetId);
  const presets = useUserPresetsStore((s) => s.presets);
  const setDefault = useUserPresetsStore((s) => s.setDefault);
  const createFromBuiltin = useUserPresetsStore((s) => s.createFromBuiltin);
  const updatePreset = useUserPresetsStore((s) => s.updatePreset);
  const deletePreset = useUserPresetsStore((s) => s.deletePreset);

  const [showCloneChooser, setShowCloneChooser] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftSummary, setDraftSummary] = useState('');

  const buttonHaptic = hapticsEnabled && !reduceMotion ? 'light' : false;

  const beginEdit = (id: string, name: string, summary: string) => {
    setEditingPresetId(id);
    setDraftName(name);
    setDraftSummary(summary);
  };

  const saveEdit = () => {
    if (!editingPresetId) return;
    updatePreset(editingPresetId, { name: draftName, summary: draftSummary });
    setEditingPresetId(null);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + space.md, paddingBottom: insets.bottom + space.x5l * 3 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.eyebrow}>PRESETS · LIBRARY</Text>
        <Text style={styles.title}>Rulesets you own</Text>

        <CardSection
          variant="surface"
          tab
          eyebrow="BUILT-INS"
          title="Core Deckd presets"
          style={styles.section}
        >
          <View style={styles.stack}>
            {builtinPresets.map((preset) => {
              const active = defaultPresetId === preset.id;
              return (
                <CardButton
                  key={preset.id}
                  variant="ghost"
                  size="sm"
                  elevated={false}
                  haptic={buttonHaptic}
                  onPress={() => setDefault(preset.id)}
                  style={styles.presetTapTarget}
                  innerStyle={styles.presetTapTargetInner}
                >
                  <CardSection
                    variant="surface"
                    eyebrow={playerRangeLabel(preset.supportsPlayerCount)}
                    title={preset.name}
                    accessory={<PlayingCard size="sm" face="down" back={active ? 'brand' : 'ink'} />}
                    style={active ? { ...styles.presetCard, ...styles.activePreset } : styles.presetCard}
                  >
                    <Text style={styles.presetSummary}>{preset.summary}</Text>
                  </CardSection>
                </CardButton>
              );
            })}
          </View>
        </CardSection>

        <CardSection
          variant="surface"
          eyebrow="YOUR PRESETS"
          title="Cosmetic clones"
          style={styles.section}
        >
          {presets.length === 0 ? (
            <CardSection variant="ghost" style={styles.emptyState}>
              <Text style={styles.emptyText}>No custom presets yet.</Text>
              <CardButton
                variant="ghost"
                size="sm"
                elevated={false}
                haptic={buttonHaptic}
                onPress={() => setShowCloneChooser(true)}
              >
                <Text style={styles.ghostButtonText}>Duplicate a built-in to customize</Text>
              </CardButton>
            </CardSection>
          ) : (
            <View style={styles.stack}>
              {presets.map((preset) => {
                const active = defaultPresetId === preset.id;
                const editing = editingPresetId === preset.id;
                return (
                  <View key={preset.id} style={styles.userPresetWrap}>
                    <CardSection
                      variant="surface"
                      eyebrow={`BASED ON · ${preset.basedOn.toUpperCase()}`}
                      title={preset.name}
                      accessory={<PlayingCard size="sm" face="down" back={active ? 'brand' : 'ink'} />}
                      style={active ? { ...styles.presetCard, ...styles.activePreset } : styles.presetCard}
                    >
                      <Text style={styles.presetSummary}>{preset.summary}</Text>
                      <View style={styles.actionRow}>
                        <CardButton
                          variant={active ? 'primary' : 'ghost'}
                          size="sm"
                          haptic={buttonHaptic}
                          onPress={() => setDefault(preset.id)}
                        >
                          <Text style={active ? styles.primaryButtonText : styles.ghostButtonText}>
                            {active ? 'Default' : 'Set default'}
                          </Text>
                        </CardButton>
                        <CardButton
                          variant="ghost"
                          size="sm"
                          elevated={false}
                          haptic={buttonHaptic}
                          onPress={() => beginEdit(preset.id, preset.name, preset.summary)}
                        >
                          <Text style={styles.ghostButtonText}>Edit</Text>
                        </CardButton>
                        <CardButton
                          variant="ghost"
                          size="sm"
                          elevated={false}
                          haptic={buttonHaptic}
                          onPress={() => deletePreset(preset.id)}
                        >
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </CardButton>
                      </View>
                    </CardSection>

                    {editing ? (
                      <CardSection variant="ghost" style={styles.inlineEditor}>
                        <Text style={styles.fieldLabel}>Preset name</Text>
                        <TextInput
                          value={draftName}
                          onChangeText={setDraftName}
                          style={styles.editorInput}
                          placeholder="Preset name"
                          placeholderTextColor={colors.inkSubtle}
                          maxLength={32}
                        />
                        <Text style={styles.fieldLabel}>Summary</Text>
                        <TextInput
                          value={draftSummary}
                          onChangeText={setDraftSummary}
                          style={[styles.editorInput, styles.editorInputTall]}
                          placeholder="Quick description"
                          placeholderTextColor={colors.inkSubtle}
                          multiline
                          maxLength={140}
                        />
                        <View style={styles.editorActions}>
                          <CardButton
                            variant="primary"
                            size="sm"
                            haptic={buttonHaptic}
                            onPress={saveEdit}
                          >
                            <Text style={styles.primaryButtonText}>Save</Text>
                          </CardButton>
                          <CardButton
                            variant="ghost"
                            size="sm"
                            elevated={false}
                            haptic={buttonHaptic}
                            onPress={() => setEditingPresetId(null)}
                          >
                            <Text style={styles.ghostButtonText}>Cancel</Text>
                          </CardButton>
                        </View>
                      </CardSection>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )}

          <CardButton
            variant="secondary"
            size="md"
            haptic={buttonHaptic}
            onPress={() => setShowCloneChooser((prev) => !prev)}
            style={styles.newPresetCta}
          >
            <Text style={styles.secondaryButtonText}>+ New preset (duplicate built-in)</Text>
          </CardButton>

          {showCloneChooser ? (
            <View style={styles.cloneList}>
              {builtinPresets.map((builtin) => (
                <CardButton
                  key={`clone-${builtin.id}`}
                  variant="ghost"
                  size="sm"
                  elevated={false}
                  haptic={buttonHaptic}
                  onPress={() => {
                    createFromBuiltin(builtin.id);
                    setShowCloneChooser(false);
                  }}
                >
                  <Text style={styles.ghostButtonText}>{`Clone ${builtin.name}`}</Text>
                </CardButton>
              ))}
            </View>
          ) : null}
        </CardSection>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: space.xl },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.micro,
    letterSpacing: letterSpacing.caps,
    color: colors.inkMuted,
    marginBottom: space.sm,
  },
  title: {
    ...textStyles.h1,
    marginBottom: space.lg,
  },
  section: { marginBottom: space.lg },
  stack: { gap: space.md },
  presetTapTarget: { width: '100%' },
  presetTapTargetInner: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  presetCard: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  activePreset: {
    borderColor: colors.brand,
    backgroundColor: alpha.brand10,
    ...shadow.cardStrong,
  },
  presetSummary: {
    ...textStyles.bodyMuted,
    fontSize: fontSizes.small,
  },
  emptyState: { marginBottom: space.md },
  emptyText: {
    ...textStyles.bodyMuted,
    marginBottom: space.md,
  },
  userPresetWrap: { gap: space.sm },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.md,
  },
  inlineEditor: { gap: space.sm },
  fieldLabel: {
    ...textStyles.label,
  },
  editorInput: {
    borderWidth: 1,
    borderColor: colors.border,
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
  newPresetCta: { marginTop: space.md },
  cloneList: { marginTop: space.md, gap: space.sm },
  primaryButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.small,
    color: colors.surface,
    letterSpacing: letterSpacing.cap,
  },
  secondaryButtonText: {
    ...textStyles.title,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  ghostButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.small,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  deleteButtonText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.small,
    color: colors.brand,
    letterSpacing: letterSpacing.cap,
  },
});
