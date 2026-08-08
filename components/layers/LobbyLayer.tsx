import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ChevronLeft, Copy, Crown, Radio, Users } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useUiStore } from '@store/uiStore';
import { useProfileStore } from '@store/profileStore';
import { useCosmeticsStore } from '@store/cosmeticsStore';
import { alpha, colors, fonts, letterSpacing, radii, shadow, space } from '@theme';

interface LobbyLayerProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

type LobbyScreen = 'landing' | 'create' | 'join' | 'room';

/**
 * Multiplayer lobby — cloud relay rooms.
 * Hosting requires a Deckd Master pass; guests join free with a code.
 * The relay transport lands in a later slice; this UI is the full flow.
 */
export function LobbyLayer({ active, topInset, bottomInset }: LobbyLayerProps) {
  const { haptic } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);
  const nickname = useProfileStore((s) => s.nickname);
  const hasMasterPass = useCosmeticsStore((s) => s.hasMasterPass);

  const [screen, setScreen] = useState<LobbyScreen>('landing');
  const [joinCode, setJoinCode] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const surfaceStyle = useLayerSurfaceEntrance(active);

  const goHome = useCallback(() => {
    haptic('light');
    setViewMode('home');
  }, [haptic, setViewMode]);

  const handleCreate = useCallback(() => {
    haptic('medium');
    if (!hasMasterPass) {
      Alert.alert(
        'Deckd Master required',
        'Hosting a lobby needs a Deckd Master pass. Guests always join free.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'View passes', onPress: () => setViewMode('home') },
        ],
      );
      return;
    }
    // Relay server slice: create room, get code.
    setRoomCode('ABCDEF');
    setScreen('room');
  }, [haptic, hasMasterPass, setViewMode]);

  const handleJoin = useCallback(() => {
    haptic('medium');
    if (joinCode.trim().length < 4) {
      Alert.alert('Join code', 'Enter the code from the host.');
      return;
    }
    // Relay server slice: join room, receive snapshot.
    setRoomCode(joinCode.trim().toUpperCase());
    setScreen('room');
  }, [haptic, joinCode]);

  const copyCode = useCallback(() => {
    haptic('light');
    // Clipboard lands with the relay slice; for now just confirm.
    Alert.alert('Room code', `${roomCode} — share it with your friends.`);
  }, [haptic, roomCode]);

  useEffect(() => {
    if (!active) return;
    // Reset transient lobby state when the layer becomes active.
    const t = setTimeout(() => {
      setScreen('landing');
      setJoinCode('');
    }, 0);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <Animated.View
      pointerEvents={active ? 'auto' : 'none'}
      style={[
        styles.root,
        { paddingTop: topInset + space.lg, paddingBottom: bottomInset + space.xl },
        surfaceStyle,
      ]}
    >
      <View style={styles.header}>
        <CardButton
          variant="ghost"
          size="sm"
          elevated={false}
          haptic="light"
          onPress={goHome}
          style={styles.backChip}
        >
          <ChevronLeft size={18} color={colors.inkMuted} />
          <Text style={styles.backText}>Home</Text>
        </CardButton>
        <Text style={styles.eyebrow}>MULTIPLAYER</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {screen === 'landing' && (
          <>
            <View style={styles.pulseWrap}>
              <Users size={48} color={colors.brand} />
            </View>
            <Text style={styles.title}>Play with friends</Text>
            <Text style={styles.copy}>
              One Master hosts the table. Everyone else joins free with a code, from anywhere.
            </Text>

            <View style={styles.actions}>
              <CardButton
                variant="primary"
                size="md"
                haptic="select"
                onPress={handleCreate}
                style={styles.fullBtn}
              >
                <Crown size={18} color={colors.surface} style={{ marginRight: space.sm }} />
                <Text style={styles.primaryBtnText}>Host a lobby</Text>
              </CardButton>

              <CardButton
                variant="secondary"
                size="md"
                haptic="light"
                onPress={() => setScreen('join')}
                style={styles.fullBtn}
              >
                <Radio size={18} color={colors.ink} style={{ marginRight: space.sm }} />
                <Text style={styles.secondaryBtnText}>Join with a code</Text>
              </CardButton>
            </View>

            {!hasMasterPass && (
              <CardSection variant="ghost" style={styles.masterCard} tab>
                <Text style={styles.masterEyebrow}>DECKD MASTER</Text>
                <Text style={styles.masterCopy}>
                  Hosting needs a Master pass. Guests always join free.
                </Text>
              </CardSection>
            )}
          </>
        )}

        {screen === 'create' && (
          <>
            <Text style={styles.title}>Host a lobby</Text>
            <Text style={styles.copy}>
              You&apos;ll get a code to share. Friends join free from anywhere.
            </Text>
            <CardButton
              variant="primary"
              size="lg"
              haptic="medium"
              onPress={handleCreate}
              style={styles.fullBtn}
            >
              <Text style={styles.primaryBtnText}>Create room</Text>
            </CardButton>
          </>
        )}

        {screen === 'join' && (
          <>
            <Text style={styles.title}>Join a lobby</Text>
            <Text style={styles.copy}>Enter the code from the host.</Text>
            <TextInput
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              placeholder="CODE"
              placeholderTextColor={colors.inkSubtle}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              style={styles.codeInput}
            />
            <CardButton
              variant="primary"
              size="lg"
              haptic="medium"
              onPress={handleJoin}
              style={styles.fullBtn}
            >
              <Text style={styles.primaryBtnText}>Join room</Text>
            </CardButton>
          </>
        )}

        {screen === 'room' && (
          <>
            <Text style={styles.title}>Room ready</Text>
            <Text style={styles.copy}>
              {hasMasterPass ? 'You are the Master. Share the code.' : `Joined as ${nickname || 'Guest'}.`}
            </Text>

            <CardSection variant="surface" padded style={styles.codeCard}>
              <Text style={styles.codeLabel}>ROOM CODE</Text>
              <Text style={styles.codeValue}>{roomCode}</Text>
              <CardButton
                variant="ghost"
                size="sm"
                elevated={false}
                haptic="light"
                onPress={copyCode}
                style={styles.copyBtn}
              >
                <Copy size={16} color={colors.inkMuted} style={{ marginRight: 6 }} />
                <Text style={styles.copyBtnText}>Copy code</Text>
              </CardButton>
            </CardSection>

            <CardSection variant="ghost" style={styles.statusCard} tab>
              <Text style={styles.statusEyebrow}>ROOM</Text>
              <Text style={styles.statusRow}>Players: 1 (you)</Text>
              <Text style={styles.statusRow}>Relay: connecting…</Text>
            </CardSection>

            <CardButton
              variant="primary"
              size="lg"
              haptic="medium"
              onPress={() => setViewMode('hub')}
              style={styles.fullBtn}
            >
              <Text style={styles.primaryBtnText}>Start the table</Text>
            </CardButton>
          </>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  backChip: {
    paddingHorizontal: space.md,
  },
  backText: {
    marginLeft: 4,
    fontSize: 14,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  eyebrow: {
    marginLeft: 'auto',
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: space.xxxl,
    gap: space.lg,
  },
  pulseWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
    marginBottom: space.sm,
    ...shadow.card,
  },
  title: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: letterSpacing.tight,
  },
  copy: {
    fontSize: 14,
    textAlign: 'center',
    color: colors.inkMuted,
    lineHeight: 20,
    fontFamily: fonts.regular,
    paddingHorizontal: space.lg,
  },
  actions: {
    width: '100%',
    gap: space.md,
    marginTop: space.md,
  },
  fullBtn: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  secondaryBtnText: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  masterCard: {
    width: '100%',
    borderColor: alpha.brand20,
    borderWidth: 1,
  },
  masterEyebrow: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.xs,
  },
  masterCopy: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
    lineHeight: 19,
  },
  codeInput: {
    width: '100%',
    height: 56,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    textAlign: 'center',
    fontSize: 24,
    fontFamily: fonts.bold,
    letterSpacing: 6,
    color: colors.ink,
  },
  codeCard: {
    width: '100%',
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.sm,
  },
  codeValue: {
    fontSize: 40,
    fontFamily: fonts.extra,
    color: colors.ink,
    letterSpacing: 8,
  },
  copyBtn: {
    marginTop: space.md,
  },
  copyBtnText: {
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: colors.inkMuted,
  },
  statusCard: {
    width: '100%',
    padding: space.lg,
  },
  statusEyebrow: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.sm,
  },
  statusRow: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.inkSoft,
    marginBottom: 4,
  },
});

export default LobbyLayer;
