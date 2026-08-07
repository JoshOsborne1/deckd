import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bluetooth, Home, Wifi } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { useMotion } from '@hooks/useMotion';
import { useProfileStore } from '@store/profileStore';
import { alpha, colors, fonts, letterSpacing, space, textStyles } from '@theme';

/**
 * Session / connectivity settings. Identity stays on `/profile`.
 * BLE is the primary USP; optional network multiplayer is explicitly secondary.
 */
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { haptic } = useMotion();
  const networkMultiplayerEnabled = useProfileStore((s) => s.networkMultiplayerEnabled);
  const setNetworkMultiplayerEnabled = useProfileStore((s) => s.setNetworkMultiplayerEnabled);
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={styles.root}>
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
          Deckd is built for real-world tables: Bluetooth works when Wi‑Fi and cell do not. Optional online
          modes are extra — never required.
        </Text>

        <CardSection variant="surface" tab eyebrow="PRIMARY" title="Bluetooth (offline)" style={styles.card}>
          <View style={styles.row}>
            <Bluetooth size={22} color={colors.brand} />
            <View style={styles.rowText}>
              <Text style={styles.body}>
                Host mode advertises a Deckd service on-device. Guests scan and connect — no router, no
                account. iOS and Android may ask for Bluetooth permission; sessions are foreground-first.
              </Text>
            </View>
          </View>
        </CardSection>

        <CardSection variant="surface" eyebrow="OPTIONAL" title="Network multiplayer" style={styles.card}>
          <View style={styles.row}>
            <Wifi size={22} color={colors.inkMuted} />
            <View style={styles.rowText}>
              <Text style={styles.body}>
                When enabled, future builds can use LAN or a relay on top of the same event protocol. Does not
                replace BLE.
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
    </View>
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
