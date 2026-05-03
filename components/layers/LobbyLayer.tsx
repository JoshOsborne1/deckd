import React, { useCallback, useEffect } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { ChevronLeft, Radio, Search, Square } from 'lucide-react-native';
import { CardButton } from '@components/CardButton';
import { CardSection } from '@components/CardSection';
import { useLayerSurfaceEntrance } from '@hooks/useLayerSurfaceEntrance';
import { useMotion } from '@hooks/useMotion';
import { useBleStore } from '@store/bleStore';
import { useUiStore } from '@store/uiStore';
import { alpha, colors, fonts, letterSpacing, shadow, space } from '@theme';

interface LobbyLayerProps {
  active: boolean;
  topInset: number;
  bottomInset: number;
}

/**
 * BLE lobby — central scan via `react-native-ble-plx` + `bleStore`.
 * Peripheral host mode remains Phase 5 (native module).
 */
export function LobbyLayer({ active, topInset, bottomInset }: LobbyLayerProps) {
  const { haptic } = useMotion();
  const setViewMode = useUiStore((s) => s.setViewMode);

  const attach = useBleStore((s) => s.attach);
  const connectionState = useBleStore((s) => s.connectionState);
  const devices = useBleStore((s) => s.devices);
  const lastError = useBleStore((s) => s.lastError);
  const startScan = useBleStore((s) => s.startScan);
  const stopScan = useBleStore((s) => s.stopScan);
  const clearError = useBleStore((s) => s.clearError);

  useEffect(() => {
    if (!active) return;
    attach();
  }, [active, attach]);

  const startScanSafe = useCallback(async () => {
    haptic('medium');
    clearError();
    try {
      await startScan();
    } catch {
      haptic('error');
    }
  }, [haptic, clearError, startScan]);

  const stopScanSafe = useCallback(() => {
    haptic('light');
    stopScan();
  }, [haptic, stopScan]);

  const surfaceStyle = useLayerSurfaceEntrance(active);

  const scanning = connectionState === 'scanning';
  const centralReady = Platform.OS !== 'web';

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
          onPress={() => setViewMode('home')}
          style={styles.backChip}
        >
          <ChevronLeft size={18} color={colors.inkMuted} />
          <Text style={styles.backText}>Home</Text>
        </CardButton>
        <Text style={styles.eyebrow}>DEAL · BLE LOBBY</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pulseWrap}>
          <Radio size={48} color={colors.brand} />
        </View>
        <Text style={styles.title}>Nearby tables</Text>
        <Text style={styles.copy}>
          Scan finds hosts advertising a Deckd-compatible name prefix. Full offline host mode
          (peripheral + GATT server) ships with the iOS native module in Phase 5.
        </Text>

        <CardSection variant="ghost" style={styles.statusCard} tab>
          <Text style={styles.statusEyebrow}>TRANSPORT</Text>
          <Text style={styles.statusRow}>
            Central (scan / connect) · {centralReady ? 'ready' : 'n/a on this platform'}
          </Text>
          <Text style={styles.statusRow}>Peripheral (advertise as host) · native module pending</Text>
          <Text style={[styles.statusRow, { marginTop: space.sm }]}>
            State:{' '}
            <Text style={styles.statusEmph}>{connectionState}</Text>
          </Text>
        </CardSection>

        {lastError ? (
          <CardSection variant="ghost" style={styles.errorCard}>
            <Text style={styles.errorEyebrow}>LAST ERROR</Text>
            <Text style={styles.errorText}>{lastError}</Text>
          </CardSection>
        ) : null}

        <View style={styles.actions}>
          <CardButton
            variant="primary"
            size="md"
            haptic="select"
            onPress={scanning ? stopScanSafe : startScanSafe}
            style={styles.scanBtn}
          >
            <Search size={18} color={colors.surface} style={{ marginRight: space.sm }} />
            <Text style={styles.scanBtnText}>{scanning ? 'Stop scan' : 'Scan for hosts'}</Text>
          </CardButton>

          <CardButton
            variant="secondary"
            size="md"
            haptic="light"
            onPress={() =>
              Alert.alert(
                'Host this table',
                'Advertising as a BLE peripheral requires the Deckd native module (Phase 5). Until then, use Pass & Play on one device.',
              )
            }
            style={styles.hostBtn}
          >
            <Square size={18} color={colors.ink} style={{ marginRight: space.sm }} />
            <Text style={styles.hostBtnText}>Host (BLE) — Phase 5</Text>
          </CardButton>
        </View>

        <CardSection variant="surface" padded style={styles.listCard}>
          <Text style={styles.listEyebrow}>DISCOVERED ({devices.length})</Text>
          {devices.length === 0 ? (
            <Text style={styles.listEmpty}>
              {scanning
                ? 'Listening… move devices closer or start a scan on another phone running Deckd.'
                : 'Tap Scan for hosts to search for Deckd-Host-* advertisements.'}
            </Text>
          ) : (
            devices.map((d) => (
              <View key={d.id} style={styles.deviceRow}>
                <Text style={styles.deviceName} numberOfLines={1}>
                  {d.label}
                </Text>
                <Text style={styles.deviceId} numberOfLines={1}>
                  {d.id}
                </Text>
              </View>
            ))
          )}
        </CardSection>

        <CardButton
          variant="primary"
          size="lg"
          haptic="medium"
          onPress={() => setViewMode('hub')}
          style={styles.fallback}
        >
          <Text style={styles.fallbackText}>Play locally for now</Text>
        </CardButton>
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
  statusCard: {
    width: '100%',
    padding: space.lg,
    marginTop: space.md,
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
  statusEmph: {
    fontFamily: fonts.bold,
    color: colors.brand,
  },
  errorCard: {
    width: '100%',
    borderColor: alpha.brand20,
    borderWidth: 1,
  },
  errorEyebrow: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.brand,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.xs,
  },
  errorText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
  },
  actions: {
    width: '100%',
    gap: space.md,
  },
  scanBtn: {
    width: '100%',
    flexDirection: 'row',
  },
  scanBtnText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
  hostBtn: {
    width: '100%',
    flexDirection: 'row',
  },
  hostBtnText: {
    color: colors.ink,
    fontSize: 14,
    fontFamily: fonts.semibold,
  },
  listCard: {
    width: '100%',
    alignSelf: 'stretch',
  },
  listEyebrow: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.inkSubtle,
    letterSpacing: letterSpacing.caps,
    marginBottom: space.md,
  },
  listEmpty: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.inkMuted,
    lineHeight: 20,
  },
  deviceRow: {
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  deviceName: {
    fontSize: 15,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  deviceId: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: colors.inkSubtle,
    marginTop: 2,
  },
  fallback: {
    marginTop: space.lg,
    width: '100%',
  },
  fallbackText: {
    color: colors.surface,
    fontSize: 15,
    fontFamily: fonts.bold,
  },
});

export default LobbyLayer;
