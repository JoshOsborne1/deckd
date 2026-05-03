import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useProfileStore } from '@store/profileStore';

export type HapticIntensity =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'rigid'
  | 'soft'
  | 'success'
  | 'warn'
  | 'error'
  | 'select';

export interface MotionApi {
  /** True when the OS requests reduced motion or the user enabled the in-app override (animations). */
  reduceMotion: boolean;
  haptic: (intensity?: HapticIntensity) => void;
  announce: (message: string) => void;
}

export function useMotion(): MotionApi {
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const reduceMotionOverride = useProfileStore((s) => s.reduceMotionOverride);
  const hapticsEnabled = useProfileStore((s) => s.hapticsEnabled);

  /** Drives Reanimated / layout — system OR user “reduce motion” in profile. */
  const reduceMotion = systemReduceMotion || reduceMotionOverride;

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setSystemReduceMotion(Boolean(v));
      })
      .catch(() => {
        /* unsupported on some platforms */
      });

    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      setSystemReduceMotion(Boolean(v)),
    );

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const haptic = useCallback(
    (intensity: HapticIntensity = 'light') => {
      if (!hapticsEnabled) return;
      /** In-app reduce-motion override does not mute haptics; OS accessibility still does. */
      if (systemReduceMotion) return;
      try {
        switch (intensity) {
          case 'light':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            break;
          case 'medium':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            break;
          case 'heavy':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            break;
          case 'rigid':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
            break;
          case 'soft':
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
            break;
          case 'success':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            break;
          case 'warn':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            break;
          case 'error':
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            break;
          case 'select':
            Haptics.selectionAsync();
            break;
        }
      } catch {
        /* unsupported on web / older devices */
      }
    },
    [systemReduceMotion, hapticsEnabled],
  );

  const announce = useCallback((message: string) => {
    AccessibilityInfo.announceForAccessibility(message);
  }, []);

  return { reduceMotion, haptic, announce };
}
