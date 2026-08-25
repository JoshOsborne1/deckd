import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Home, Smartphone, Volume2, Wifi } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { FeltDrawer } from '@components/FeltDrawer';
import { useMotion } from '@hooks/useMotion';
import { useProfileStore } from '@store/profileStore';
import { useUiStore } from '@store/uiStore';
import { alpha, colors, fonts, letterSpacing, space, textStyles } from '@theme';

/**
 * Session / connectivity settings. Identity stays on `/profile`.
 * Pass-and-play is always local; online lobbies are an optional second surface.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { haptic } = useMotion();
  const networkMultiplayerEnabled = useProfileStore((s) => s.networkMultiplayerEnabled);
  const setNetworkMultiplayerEnabled = useProfileStore((s) => s.setNetworkMultiplayerEnabled);
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);
  const soundEnabled = useUiStore((s) => s.soundEnabled);
  const setSoundEnabled = useUiStore((s) => s.setSoundEnabled);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <FeltDrawer>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.x5l * 3 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <CardButton
          variant="ghost"
          size="sm"
          elevated={false}
          haptic={hapticsEnabled ? 'light' : false}
          onPress={back}
          style={styles.back}
        >
          <Home size={18} color={colors.inkMuted} />
          <Text style={styles.backLabel}>Back</Text>
        </CardButton>

        <Text style={styles.eyebrow}>SETTINGS</Text>
        <Text style={styles.title}>Play without signal</Text>
        <Text style={styles.lede}>
          Deckd is built for real-world tables: pass-and-play works with no network at all. Online
          lobbies are optional — never required.
        </Text>

        <CardSection variant="surface" tab eyebrow="OFFLINE" title="Pass and play" style={styles.card}>
          <View style={styles.row}>
            <Smartphone size={22} color={colors.brand} />
            <View style={styles.rowText}>
              <Text style={styles.body}>
                One phone, one deck, pass it around. No router, no account, no signal needed.
              </Text>
            </View>
          </View>
        </CardSection>

        <CardSection variant="surface" eyebrow="SOUND" title="Table sounds" style={styles.card}>
          <View style={styles.row}>
            <Volume2 size={22} color={colors.inkMuted} />
            <View style={styles.rowText}>
              <Text style={styles.body}>
                Subtle effects for dealing, flipping, and discarding cards. Turn off for a silent table.
              </Text>
            </View>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Sound effects</Text>
            <Switch
              value={soundEnabled}
              onValueChange={(v) => {
                if (hapticsEnabled) haptic('select');
                setSoundEnabled(v);
              }}
              trackColor={{ false: alpha.inkOverlay12, true: alpha.brand20 }}
              thumbColor={soundEnabled ? colors.brand : colors.surface}
            />
          </View>
        </CardSection>

        <CardSection variant="surface" eyebrow="ONLINE" title="Network multiplayer" style={styles.card}>
          <View style={styles.row}>
            <Wifi size={22} color={colors.inkMuted} />
            <View style={styles.rowText}>
              <Text style={styles.body}>
                Host a lobby and friends join free from anywhere. Requires a network connection.
              </Text>
            </View>
          </View>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Allow network modes</Text>
            <Switch
              value={networkMultiplayerEnabled}
              onValueChange={(v) => {
                if (hapticsEnabled) haptic('select');
                setNetworkMultiplayerEnabled(v);
              }}
              trackColor={{ false: alpha.inkOverlay12, true: alpha.brand20 }}
              thumbColor={networkMultiplayerEnabled ? colors.brand : colors.surface}
            />
          </View>
        </CardSection>

        <CardButton
          variant="secondary"
          size="md"
          haptic={hapticsEnabled ? 'light' : false}
          onPress={() => router.push('/profile')}
          style={styles.profileLink}
        >
          <Text style={styles.profileLinkText}>Player identity & haptics → Profile</Text>
        </CardButton>
      </ScrollView>
    </FeltDrawer>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: space.lg, gap: space.md },
  back: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  backLabel: { ...textStyles.body, color: colors.inkMuted },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: letterSpacing.caps,
    color: colors.inkMuted,
  },
  title: {
    fontFamily: fonts.extra,
    fontSize: 26,
    letterSpacing: letterSpacing.tight,
    color: colors.ink,
    marginBottom: space.sm,
  },
  lede: { ...textStyles.body, color: colors.inkSoft, marginBottom: space.lg, lineHeight: 22 },
  card: { marginBottom: space.sm },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  rowText: { flex: 1 },
  body: { ...textStyles.body, color: colors.inkSoft, lineHeight: 22 },
  toggleRow: {
    marginTop: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  profileLink: { marginTop: space.xl },
  profileLinkText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.inkSoft },
});
