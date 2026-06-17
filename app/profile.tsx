import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AvatarPlaceholder } from '@components/AvatarPlaceholder';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { useMotion } from '@hooks/useMotion';
import { useProfileStore } from '@store/profileStore';
import { useSessionHistoryStore } from '@store/sessionHistoryStore';
import { alpha, colors, fontSizes, fonts, letterSpacing, radii, shadow, space, textStyles } from '@theme';

const AVATAR_SEEDS = ['deckd-ace', 'deckd-king', 'deckd-queen', 'deckd-joker', 'deckd-club', 'deckd-ghost'];

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { reduceMotion, haptic } = useMotion();
  const nickname = useProfileStore((s) => s.nickname);
  const avatarSeed = useProfileStore((s) => s.avatarSeed);
  const level = useProfileStore((s) => s.level);
  const streak = useProfileStore((s) => s.streak);
  const gamesPlayed = useProfileStore((s) => s.gamesPlayed);
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const reduceMotionOverride = useProfileStore((s) => s.reduceMotionOverride);
  const setNickname = useProfileStore((s) => s.setNickname);
  const setAvatarSeed = useProfileStore((s) => s.setAvatarSeed);
  const setHapticsEnabled = useProfileStore((s) => s.setHapticsEnabled);
  const setReduceMotionOverride = useProfileStore((s) => s.setReduceMotionOverride);
  const resetProfile = useProfileStore((s) => s.resetProfile);
  const sessionEntries = useSessionHistoryStore((s) => s.entries);
  const clearSessionHistory = useSessionHistoryStore((s) => s.clear);

  const [draftNickname, setDraftNickname] = useState(nickname);

  useEffect(() => {
    setDraftNickname(nickname);
  }, [nickname]);

  const toggleHaptic = useMemo(() => (hapticsEnabled ? 'light' : false), [hapticsEnabled]);
  const backToHome = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.push('/');
  };

  const commitNickname = () => {
    setNickname(draftNickname);
  };

  const handleResetData = () => {
    Alert.alert('Reset local data?', 'This will clear nickname, avatar, preferences, and local stats.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          resetProfile();
          clearSessionHistory();
          if (hapticsEnabled) {
            haptic('warn');
          }
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.x5l * 3 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <CardButton
            variant="ghost"
            size="sm"
            elevated={false}
            haptic={toggleHaptic}
            onPress={backToHome}
            style={styles.backButton}
          >
            <Text style={styles.backButtonLabel}>Back</Text>
          </CardButton>
          <CardButton
            variant="ghost"
            size="sm"
            elevated={false}
            haptic={toggleHaptic}
            onPress={() => router.push('/settings')}
            style={styles.settingsChip}
          >
            <Text style={styles.settingsChipLabel}>Settings</Text>
          </CardButton>
        </View>

        <CardSection
          variant="surface"
          tab
          eyebrow="YOUR DECK"
          title="Player identity"
          style={styles.section}
        >
          <View style={styles.identityHeader}>
            <AvatarPlaceholder seed={avatarSeed} label={nickname} size={space.x5l * 2} ring="brand" />
            <View style={styles.chipsRow}>
              <View style={styles.chip}>
                <Text style={styles.chipLabel}>{`LV ${level}`}</Text>
              </View>
              <View style={styles.chip}>
                <Text style={styles.chipLabel}>{`${streak} STREAK`}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.inputLabel}>Nickname</Text>
          <TextInput
            value={draftNickname}
            onChangeText={setDraftNickname}
            onBlur={commitNickname}
            placeholder="Your name at the table"
            placeholderTextColor={colors.inkSubtle}
            maxLength={24}
            style={styles.nicknameInput}
          />

          <Text style={styles.inputLabel}>Avatar seed</Text>
          <View style={styles.seedGrid}>
            {AVATAR_SEEDS.map((seed) => {
              const active = seed === avatarSeed;
              return (
                <CardButton
                  key={seed}
                  variant={active ? 'primary' : 'ghost'}
                  size="sm"
                  elevated={active}
                  haptic={toggleHaptic}
                  onPress={() => setAvatarSeed(seed)}
                  style={styles.seedTile}
                  innerStyle={styles.seedTileInner}
                >
                  <AvatarPlaceholder
                    seed={seed}
                    label={nickname}
                    size={space.xxl + space.lg}
                    ring={active ? 'soft' : 'none'}
                  />
                </CardButton>
              );
            })}
          </View>
        </CardSection>

        <CardSection
          variant="surface"
          eyebrow="PREFERENCES"
          title="Touch and motion"
          style={styles.section}
        >
          <View style={styles.preferenceRow}>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Haptic feedback</Text>
              <Text style={styles.preferenceMeta}>Tap vibration for controls</Text>
            </View>
            <CardButton
              variant={hapticsEnabled ? 'primary' : 'ghost'}
              size="sm"
              haptic={toggleHaptic}
              onPress={() => setHapticsEnabled(!hapticsEnabled)}
            >
              <Text style={hapticsEnabled ? styles.toggleOnText : styles.toggleOffText}>
                {hapticsEnabled ? 'On' : 'Off'}
              </Text>
            </CardButton>
          </View>

          <View style={styles.preferenceDivider} />

          <View style={styles.preferenceRow}>
            <View style={styles.preferenceText}>
              <Text style={styles.preferenceTitle}>Reduce motion override</Text>
              <Text style={styles.preferenceMeta}>
                {reduceMotion
                  ? 'System says reduce motion is enabled'
                  : 'System says reduce motion is disabled'}
              </Text>
            </View>
            <CardButton
              variant={reduceMotionOverride ? 'primary' : 'ghost'}
              size="sm"
              haptic={toggleHaptic}
              onPress={() => setReduceMotionOverride(!reduceMotionOverride)}
            >
              <Text style={reduceMotionOverride ? styles.toggleOnText : styles.toggleOffText}>
                {reduceMotionOverride ? 'On' : 'Off'}
              </Text>
            </CardButton>
          </View>
        </CardSection>

        <CardSection
          variant="surface"
          eyebrow="STATS"
          title="Local progress"
          style={styles.section}
        >
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Level</Text>
              <Text style={styles.statValue}>{level ?? 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Streak</Text>
              <Text style={styles.statValue}>{streak ?? 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Games</Text>
              <Text style={styles.statValue}>{gamesPlayed ?? 0}</Text>
            </View>
          </View>
        </CardSection>

        <CardSection
          variant="surface"
          eyebrow="SESSIONS"
          title="Recent tables"
          style={styles.section}
        >
          {sessionEntries.length === 0 ? (
            <Text style={styles.sessionEmpty}>Finished games you start from the hub appear here.</Text>
          ) : (
            sessionEntries.map((row) => (
              <View key={`${row.sessionId}-${row.at}`} style={styles.sessionRow}>
                <Text style={styles.sessionPreset}>{row.presetId}</Text>
                <Text style={styles.sessionMeta}>
                  {row.playerCount}P · {row.eventCount} evt ·{' '}
                  {new Date(row.at).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ))
          )}
        </CardSection>

        <CardSection variant="ghost" eyebrow="DANGER ZONE" title="Local reset">
          <Text style={styles.dangerText}>
            Clears this device profile only. No cloud account data exists.
          </Text>
          <CardButton
            variant="ghost"
            size="md"
            elevated={false}
            haptic={toggleHaptic}
            onPress={handleResetData}
            style={styles.resetButton}
          >
            <Text style={styles.resetLabel}>Reset local data</Text>
          </CardButton>
        </CardSection>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingHorizontal: space.xl },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  backButton: { alignSelf: 'flex-start' },
  backButtonLabel: { ...textStyles.label, color: colors.inkMuted },
  settingsChip: { alignSelf: 'flex-start' },
  settingsChipLabel: { ...textStyles.label, color: colors.brand },
  section: { marginBottom: space.lg },
  identityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  chipsRow: { flexDirection: 'row', gap: space.sm },
  chip: {
    borderRadius: radii.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.micro,
    color: colors.inkMuted,
    letterSpacing: letterSpacing.cap,
  },
  inputLabel: {
    ...textStyles.label,
    marginBottom: space.xs,
    color: colors.inkMuted,
  },
  nicknameInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: fontSizes.body,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.lg,
  },
  seedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  seedTile: { width: '31%' },
  seedTileInner: {
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  preferenceRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  preferenceText: { flex: 1 },
  preferenceTitle: {
    ...textStyles.title,
    fontSize: fontSizes.bodyLg,
    color: colors.ink,
  },
  preferenceMeta: {
    ...textStyles.bodyMuted,
    fontSize: fontSizes.small,
    marginTop: space.xxs,
  },
  preferenceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: space.md,
  },
  toggleOnText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.small,
    letterSpacing: letterSpacing.cap,
    color: colors.surface,
  },
  toggleOffText: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.small,
    letterSpacing: letterSpacing.cap,
    color: colors.inkMuted,
  },
  statsRow: {
    flexDirection: 'row',
    gap: space.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    padding: space.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  statLabel: {
    fontFamily: fonts.bold,
    fontSize: fontSizes.caption,
    letterSpacing: letterSpacing.cap,
    color: colors.inkMuted,
    marginBottom: space.xs,
  },
  statValue: {
    fontFamily: fonts.extra,
    fontSize: fontSizes.h2,
    color: colors.ink,
  },
  sessionEmpty: {
    ...textStyles.bodyMuted,
    fontSize: fontSizes.small,
  },
  sessionRow: {
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sessionPreset: {
    fontFamily: fonts.semibold,
    fontSize: fontSizes.body,
    color: colors.ink,
  },
  sessionMeta: {
    marginTop: 4,
    fontFamily: fonts.regular,
    fontSize: fontSizes.caption,
    color: colors.inkMuted,
  },
  dangerText: {
    ...textStyles.bodyMuted,
    fontSize: fontSizes.small,
    marginBottom: space.md,
  },
  resetButton: {
    ...shadow.none,
    borderColor: alpha.brand30,
  },
  resetLabel: {
    ...textStyles.label,
    color: colors.brand,
  },
});
