import React, { useCallback } from 'react';
import { PrivacyVeil } from '@components/PrivacyVeil';
import { useGameStore } from '@store/gameStore';
import { useUiStore } from '@store/uiStore';

/**
 * Pass-and-play privacy overlay. Sits on top of table when the current
 * player needs to hand the device to someone else.
 */
export function PassLayer() {
  const viewMode = useUiStore((s) => s.viewMode);
  const passContext = useUiStore((s) => s.passContext);
  const closePass = useUiStore((s) => s.closePass);
  const exitPrivacy = useGameStore((s) => s.exitPrivacy);

  const visible = viewMode === 'pass' && passContext !== null;

  const onReveal = useCallback(() => {
    exitPrivacy();
    closePass();
  }, [exitPrivacy, closePass]);

  return (
    <PrivacyVeil
      visible={visible}
      recipientName={passContext?.recipientName ?? ''}
      recipientSeed={passContext?.recipientSeed}
      onReveal={onReveal}
    />
  );
}

export default PassLayer;
